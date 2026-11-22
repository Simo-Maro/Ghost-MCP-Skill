import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { GhostClient } from '../ghost/client.js';
import { runSiteReadinessAudit } from '../guardrails/audit.js';
import { errorResult, okResult } from './helpers.js';

export function registerSiteTools(
  server: McpServer,
  client: GhostClient,
  fetchImpl?: typeof fetch,
): void {
  server.registerTool(
    'get_site_info',
    {
      title: 'Get Site Info',
      description:
        'Fetch metadata about the connected Ghost Site (title, description, URL, logo, icon, and Ghost version).',
      inputSchema: z.object({}),
      outputSchema: z.object({
        title: z.string(),
        description: z.string().nullable(),
        url: z.string(),
        logo: z.string().nullable(),
        icon: z.string().nullable(),
        version: z.string(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const site = await client.getSiteInfo();
        return okResult({
          title: site.title,
          description: site.description ?? null,
          url: site.url,
          logo: site.logo ?? null,
          icon: site.icon ?? null,
          version: site.version,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'audit_site_readiness',
    {
      title: 'Audit Site Readiness',
      description:
        'Run a read-only Readiness Audit evaluating Pages (Privacy Policy disclosures, About, Contact), duplicate metadata, thin public Tags, author E-E-A-T completeness, and optional public HTTP probes (/robots.txt, /sitemap.xml, /ads.txt, HTTPS).',
      inputSchema: z.object({
        checkLiveEndpoints: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to probe public /robots.txt, /sitemap.xml, and /ads.txt endpoints (set false for local/staging Sites).'),
        timeoutMs: z
          .number()
          .int()
          .min(200)
          .max(30000)
          .optional()
          .default(5000)
          .describe('Timeout in milliseconds for each live HTTP probe (default: 5000).'),
      }),
      outputSchema: z.object({
        site: z.object({
          title: z.string(),
          url: z.string(),
          version: z.string(),
          https: z.boolean(),
        }),
        summary: z.object({
          publishedPosts: z.number(),
          draftPosts: z.number(),
          publishedPages: z.number(),
          publicTags: z.number(),
          blockers: z.number(),
          warnings: z.number(),
          infos: z.number(),
        }),
        findings: z.array(
          z.object({
            code: z.string(),
            severity: z.enum(['blocker', 'warning', 'info']),
            message: z.string(),
            count: z.number().optional(),
            examples: z.array(z.string()).optional(),
          }),
        ),
        liveEndpointProbes: z.object({
          checked: z.boolean(),
          results: z.array(
            z.object({
              endpoint: z.string(),
              status: z.number().nullable(),
              ok: z.boolean(),
              note: z.string(),
            }),
          ),
        }),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const report = await runSiteReadinessAudit(client, {
          checkLiveEndpoints: args.checkLiveEndpoints,
          timeoutMs: args.timeoutMs,
          fetch: fetchImpl,
        });
        return okResult(report as unknown as Record<string, unknown>);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
