import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerConfig } from '../config.js';
import type { GhostClient } from '../ghost/client.js';
import { ValidationError } from '../guardrails/warnings.js';
import { errorResult, okResult, pickDefined, toTagDetail } from './helpers.js';
import { paginationSchema, tagDetailSchema } from './schemas.js';

const tagWriteFieldsShape = {
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  feature_image: z.string().nullable().optional(),
  visibility: z.enum(['public', 'internal']).optional(),
  meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(),
  og_image: z.string().nullable().optional(),
  og_title: z.string().nullable().optional(),
  og_description: z.string().nullable().optional(),
  twitter_image: z.string().nullable().optional(),
  twitter_title: z.string().nullable().optional(),
  twitter_description: z.string().nullable().optional(),
  codeinjection_head: z.string().nullable().optional(),
  codeinjection_foot: z.string().nullable().optional(),
  canonical_url: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
};

export function registerTagTools(
  server: McpServer,
  client: GhostClient,
  config: ServerConfig,
): void {
  server.registerTool(
    'list_tags',
    {
      title: 'List Tags',
      description:
        'List public and #internal Tags on the Ghost Site with explicit pagination and optional post counts.',
      inputSchema: z.object({
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(50),
        filter: z
          .string()
          .optional()
          .describe('Optional Ghost NQL filter (e.g. "visibility:public" or "visibility:internal").'),
        order: z.string().optional().describe('Optional Ghost sort order.'),
        includePostCount: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include post counts (count.posts) for each Tag.'),
      }),
      outputSchema: z.object({
        tags: z.array(tagDetailSchema),
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
        const { tags, pagination } = await client.listTags({
          page: args.page,
          limit: args.limit,
          filter: args.filter,
          order: args.order,
          include: args.includePostCount ? 'count.posts' : undefined,
        });
        return okResult({
          tags: tags.map(toTagDetail),
          pagination,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_tag',
    {
      title: 'Get Tag',
      description:
        'Fetch a single Tag by either id or slug (using Ghost native /slug/{slug}/ lookup).',
      inputSchema: z.object({
        id: z.string().min(1).optional().describe('Tag ID (mutually exclusive with slug).'),
        slug: z.string().min(1).optional().describe('Tag slug (mutually exclusive with id).'),
        includePostCount: z.boolean().optional().default(false),
      }),
      outputSchema: z.object({
        tag: tagDetailSchema,
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
        const tag = await client.getTag({ id: args.id, slug: args.slug }, args.includePostCount);
        return okResult({ tag: toTagDetail(tag) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (config.readOnly) {
    return;
  }

  server.registerTool(
    'create_tag',
    {
      title: 'Create Tag',
      description:
        'Create a new public or #internal Tag with optional SEO, Open Graph, Twitter, and code-injection metadata.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Tag name (prefix with "#" for an internal Tag).'),
        ...tagWriteFieldsShape,
      }),
      outputSchema: z.object({
        tag: tagDetailSchema,
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
        const payload = pickDefined(args);
        const created = await client.createTag(payload);
        return okResult({ tag: toTagDetail(created) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'update_tag',
    {
      title: 'Update Tag',
      description: 'Update an existing Tag by id.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Tag ID to update.'),
        name: z.string().min(1).optional(),
        ...tagWriteFieldsShape,
      }),
      outputSchema: z.object({
        tag: tagDetailSchema,
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
        const { id, ...rest } = args;
        const payload = pickDefined(rest);
        const updated = await client.updateTag(id, payload);
        return okResult({ tag: toTagDetail(updated) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (!config.draftOnly) {
    server.registerTool(
      'delete_tag',
      {
        title: 'Delete Tag',
        description: 'Permanently delete a single Tag by id.',
        inputSchema: z.object({
          id: z.string().min(1).describe('Tag ID to delete.'),
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
          await client.deleteTag(args.id);
          return okResult({ deleted: true, id: args.id });
        } catch (err) {
          return errorResult(err);
        }
      },
    );
  }
}
