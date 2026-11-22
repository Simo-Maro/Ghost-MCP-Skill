import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerConfig } from '../config.js';
import type { GhostClient } from '../ghost/client.js';
import {
  analyzeContentWarnings,
  assertContentInvariants,
  ValidationError,
} from '../guardrails/warnings.js';
import {
  errorResult,
  formatsParamFor,
  normalizeTagInputs,
  okResult,
  pickDefined,
  toContentDetail,
  toContentSummary,
} from './helpers.js';
import {
  contentDetailSchema,
  contentFormatSchema,
  contentSummarySchema,
  contentWriteFieldsShape,
  paginationSchema,
  warningSchema,
} from './schemas.js';

const pageExtraFieldsShape = {
  show_title_and_feature_image: z
    .boolean()
    .optional()
    .describe('Whether to display the Page title and Feature Image header on the live Page.'),
};

export function registerPageTools(
  server: McpServer,
  client: GhostClient,
  config: ServerConfig,
): void {
  server.registerTool(
    'list_pages',
    {
      title: 'List Pages',
      description:
        'List standalone Pages (such as About, Contact, Privacy Policy) with explicit pagination (max 100 per page). Returns compact body-free summaries.',
      inputSchema: z.object({
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(15),
        filter: z.string().optional().describe('Optional Ghost NQL filter.'),
        order: z.string().optional().describe('Optional Ghost sort order.'),
      }),
      outputSchema: z.object({
        pages: z.array(contentSummarySchema),
        pagination: paginationSchema,
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
        const { pages, pagination } = await client.listPages({
          page: args.page,
          limit: args.limit,
          filter: args.filter,
          order: args.order,
        });
        return okResult({
          pages: pages.map(toContentSummary),
          pagination,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_page',
    {
      title: 'Get Page',
      description:
        'Fetch a single Page by either id or slug (using Ghost native /slug/{slug}/ lookup) with selectable body format.',
      inputSchema: z.object({
        id: z.string().min(1).optional().describe('Page ID (mutually exclusive with slug).'),
        slug: z.string().min(1).optional().describe('Page URL slug (mutually exclusive with id).'),
        format: contentFormatSchema.optional().default('html'),
      }),
      outputSchema: z.object({
        page: contentDetailSchema,
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
        if ((!args.id && !args.slug) || (args.id && args.slug)) {
          throw new ValidationError('Provide either "id" or "slug" (mutually exclusive).');
        }
        const page = await client.getPage(
          { id: args.id, slug: args.slug },
          formatsParamFor(args.format),
        );
        return okResult({ page: toContentDetail(page, args.format) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (config.readOnly) {
    return;
  }

  server.registerTool(
    'create_page',
    {
      title: 'Create Page',
      description:
        'Create a new standalone Page (defaults to status "draft"). Supports custom_template, show_title_and_feature_image, semantic HTML or raw Lexical JSON, and returns non-blocking SEO/AdSense warnings[].',
      inputSchema: z.object({
        title: z.string().min(1).describe('Page title (max 255 chars).'),
        ...contentWriteFieldsShape,
        ...pageExtraFieldsShape,
      }),
      outputSchema: z.object({
        page: contentDetailSchema,
        warnings: z.array(warningSchema),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        assertContentInvariants(args);
        const targetStatus = args.status ?? 'draft';
        if (config.draftOnly && targetStatus !== 'draft') {
          throw new ValidationError(
            `--draft-only mode is active: cannot create a Page with status "${targetStatus}". Create it as "draft" instead.`,
          );
        }

        const payload = pickDefined({
          ...args,
          status: targetStatus,
          tags: normalizeTagInputs(args.tags),
        });
        const sourceHtml = args.html !== undefined;
        const created = await client.createPage(payload, sourceHtml);
        const warnings = analyzeContentWarnings({
          title: created.title,
          slug: created.slug,
          html: args.html ?? created.html,
          meta_description: created.meta_description,
          feature_image: created.feature_image,
          feature_image_alt: created.feature_image_alt,
        });

        return okResult({
          page: toContentDetail(created, 'html'),
          warnings,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'update_page',
    {
      title: 'Update Page',
      description:
        'Update an existing Page (requires current updated_at for optimistic locking). Omit both html and lexical for a safe metadata-only update without modifying the existing Lexical body.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Page ID to update.'),
        updated_at: z
          .string()
          .min(1)
          .describe('Current updated_at timestamp from get_page (required for optimistic locking).'),
        title: z.string().min(1).optional(),
        ...contentWriteFieldsShape,
        ...pageExtraFieldsShape,
      }),
      outputSchema: z.object({
        page: contentDetailSchema,
        warnings: z.array(warningSchema),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        assertContentInvariants(args);
        if (config.draftOnly && args.status && args.status !== 'draft') {
          throw new ValidationError(
            `--draft-only mode is active: cannot set Page status to "${args.status}".`,
          );
        }

        const existing = await client.getPage({ id: args.id }, undefined);
        if (
          config.draftOnly &&
          (existing.status === 'published' || existing.status === 'scheduled')
        ) {
          throw new ValidationError(
            `--draft-only mode is active: cannot modify Page "${args.id}" because its current status is "${existing.status}".`,
          );
        }

        const existingTime = Date.parse(existing.updated_at);
        const providedTime = Date.parse(args.updated_at);
        if (
          Number.isNaN(providedTime) ||
          (!Number.isNaN(existingTime) && existingTime !== providedTime) ||
          (Number.isNaN(existingTime) && existing.updated_at !== args.updated_at)
        ) {
          throw new ValidationError(
            `Optimistic lock conflict on Page "${args.id}": provided updated_at ("${args.updated_at}") does not match current Ghost updated_at ("${existing.updated_at}"). Re-fetch with get_page before retrying.`,
          );
        }

        const { id, ...rest } = args;
        const payload = pickDefined({
          ...rest,
          tags: normalizeTagInputs(rest.tags),
        });
        const sourceHtml = args.html !== undefined;
        const updated = await client.updatePage(id, payload, sourceHtml);
        const warnings = analyzeContentWarnings({
          title: updated.title,
          slug: updated.slug,
          html: args.html ?? updated.html,
          meta_description: updated.meta_description,
          feature_image: updated.feature_image,
          feature_image_alt: updated.feature_image_alt,
        });

        return okResult({
          page: toContentDetail(updated, 'html'),
          warnings,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (!config.draftOnly) {
    server.registerTool(
      'delete_page',
      {
        title: 'Delete Page',
        description: 'Permanently delete a single Page by id.',
        inputSchema: z.object({
          id: z.string().min(1).describe('Page ID to delete.'),
        }),
        outputSchema: z.object({
          deleted: z.boolean(),
          id: z.string(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          await client.deletePage(args.id);
          return okResult({ deleted: true, id: args.id });
        } catch (err) {
          return errorResult(err);
        }
      },
    );
  }
}
