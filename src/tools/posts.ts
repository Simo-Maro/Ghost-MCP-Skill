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

export function registerPostTools(
  server: McpServer,
  client: GhostClient,
  config: ServerConfig,
): void {
  server.registerTool(
    'list_posts',
    {
      title: 'List Posts',
      description:
        'List Posts on the Ghost Site with explicit pagination (max 100 per page). Returns compact body-free summaries.',
      inputSchema: z.object({
        page: z.number().int().min(1).optional().default(1),
        limit: z.number().int().min(1).max(100).optional().default(15),
        filter: z
          .string()
          .optional()
          .describe('Optional Ghost NQL filter (e.g. "status:draft", "tag:seo").'),
        order: z
          .string()
          .optional()
          .describe('Optional Ghost sort order (e.g. "updated_at desc", "published_at desc").'),
      }),
      outputSchema: z.object({
        posts: z.array(contentSummarySchema),
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
        const { posts, pagination } = await client.listPosts({
          page: args.page,
          limit: args.limit,
          filter: args.filter,
          order: args.order,
        });
        return okResult({
          posts: posts.map(toContentSummary),
          pagination,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_post',
    {
      title: 'Get Post',
      description:
        'Fetch a single Post by either id or slug (using Ghost native /slug/{slug}/ lookup) with selectable body format.',
      inputSchema: z.object({
        id: z.string().min(1).optional().describe('Post ID (mutually exclusive with slug).'),
        slug: z.string().min(1).optional().describe('Post URL slug (mutually exclusive with id).'),
        format: contentFormatSchema.optional().default('html'),
      }),
      outputSchema: z.object({
        post: contentDetailSchema,
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
        const post = await client.getPost(
          { id: args.id, slug: args.slug },
          formatsParamFor(args.format),
        );
        return okResult({ post: toContentDetail(post, args.format) });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (config.readOnly) {
    return;
  }

  server.registerTool(
    'create_post',
    {
      title: 'Create Post',
      description:
        'Create a new Post (defaults to status "draft"). Accepts clean semantic HTML (converted via ?source=html) or raw Lexical JSON, supports custom_template and full SEO/social metadata, and returns non-blocking SEO/AdSense warnings[].',
      inputSchema: z.object({
        title: z.string().min(1).describe('Post title (max 255 chars).'),
        ...contentWriteFieldsShape,
      }),
      outputSchema: z.object({
        post: contentDetailSchema,
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
            `--draft-only mode is active: cannot create a Post with status "${targetStatus}". Create it as "draft" instead.`,
          );
        }

        const payload = pickDefined({
          ...args,
          status: targetStatus,
          tags: normalizeTagInputs(args.tags),
        });
        const sourceHtml = args.html !== undefined;
        const created = await client.createPost(payload, sourceHtml);
        const warnings = analyzeContentWarnings({
          title: created.title,
          slug: created.slug,
          html: args.html ?? created.html,
          meta_description: created.meta_description,
          feature_image: created.feature_image,
          feature_image_alt: created.feature_image_alt,
        });

        return okResult({
          post: toContentDetail(created, 'html'),
          warnings,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'update_post',
    {
      title: 'Update Post',
      description:
        'Update an existing Post (requires current updated_at for optimistic locking). Omit both html and lexical to perform a safe metadata-only update without touching the existing Lexical body.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Post ID to update.'),
        updated_at: z
          .string()
          .min(1)
          .describe('Current updated_at timestamp from get_post (required for optimistic locking).'),
        title: z.string().min(1).optional(),
        ...contentWriteFieldsShape,
      }),
      outputSchema: z.object({
        post: contentDetailSchema,
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
            `--draft-only mode is active: cannot set Post status to "${args.status}".`,
          );
        }

        const existing = await client.getPost({ id: args.id }, undefined);
        if (
          config.draftOnly &&
          (existing.status === 'published' || existing.status === 'scheduled')
        ) {
          throw new ValidationError(
            `--draft-only mode is active: cannot modify Post "${args.id}" because its current status is "${existing.status}".`,
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
            `Optimistic lock conflict on Post "${args.id}": provided updated_at ("${args.updated_at}") does not match current Ghost updated_at ("${existing.updated_at}"). Re-fetch with get_post before retrying.`,
          );
        }

        const { id, ...rest } = args;
        const payload = pickDefined({
          ...rest,
          tags: normalizeTagInputs(rest.tags),
        });
        const sourceHtml = args.html !== undefined;
        const updated = await client.updatePost(id, payload, sourceHtml);
        const warnings = analyzeContentWarnings({
          title: updated.title,
          slug: updated.slug,
          html: args.html ?? updated.html,
          meta_description: updated.meta_description,
          feature_image: updated.feature_image,
          feature_image_alt: updated.feature_image_alt,
        });

        return okResult({
          post: toContentDetail(updated, 'html'),
          warnings,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  if (!config.draftOnly) {
    server.registerTool(
      'delete_post',
      {
        title: 'Delete Post',
        description: 'Permanently delete a single Post by id.',
        inputSchema: z.object({
          id: z.string().min(1).describe('Post ID to delete.'),
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
          await client.deletePost(args.id);
          return okResult({ deleted: true, id: args.id });
        } catch (err) {
          return errorResult(err);
        }
      },
    );
  }
}
