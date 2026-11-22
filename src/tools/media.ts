import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { ServerConfig } from '../config.js';
import type { GhostClient } from '../ghost/client.js';
import {
  DEFAULT_MAX_WIDTH,
  DEFAULT_WEBP_QUALITY,
  prepareImageForUpload,
  type SharpLoader,
} from '../media/upload.js';
import { errorResult, okResult } from './helpers.js';

export function registerMediaTools(
  server: McpServer,
  client: GhostClient,
  config: ServerConfig,
  loadSharp?: SharpLoader,
): void {
  if (config.readOnly) {
    return;
  }

  server.registerTool(
    'upload_image',
    {
      title: 'Upload Image',
      description:
        'Upload a local image to Ghost Admin API for use as a Feature Image or inline visual. By default (optimize: true), converts static raster images (including .avif) to WebP (maxWidth: 1600, quality: 82, auto-oriented, EXIF stripped) while passing through SVG, multi-frame animated GIF/WebP, and ICO (for purpose="icon") untouched.',
      inputSchema: z.object({
        filePath: z.string().min(1).describe('Local filesystem path to the image file.'),
        purpose: z
          .enum(['image', 'profile_image', 'icon'])
          .optional()
          .default('image')
          .describe('Ghost image purpose (default: "image").'),
        filename: z
          .string()
          .min(1)
          .optional()
          .describe('Optional SEO-friendly filename override (e.g. "ghost-mcp-architecture.webp").'),
        ref: z
          .string()
          .optional()
          .describe('Optional reference string echoed back by Ghost.'),
        optimize: z
          .boolean()
          .optional()
          .default(true)
          .describe('Convert static rasters to WebP with EXIF stripped (default: true). Set false to upload Ghost-compatible files raw.'),
        maxWidth: z
          .number()
          .int()
          .min(64)
          .max(6000)
          .optional()
          .default(DEFAULT_MAX_WIDTH)
          .describe('Maximum output width in pixels when optimizing (downscale-only, default: 1600).'),
        quality: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(DEFAULT_WEBP_QUALITY)
          .describe('WebP compression quality 1-100 when optimizing (default: 82).'),
      }),
      outputSchema: z.object({
        url: z.string(),
        ref: z.string().nullable(),
        filename: z.string(),
        mimeType: z.string(),
        optimized: z.boolean(),
        passthroughReason: z.string().optional(),
        originalBytes: z.number(),
        finalBytes: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
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
        const prepared = await prepareImageForUpload({
          filePath: args.filePath,
          purpose: args.purpose,
          filename: args.filename,
          optimize: args.optimize,
          maxWidth: args.maxWidth,
          quality: args.quality,
          uploadRoot: config.uploadRoot,
          loadSharp,
        });

        const uploaded = await client.uploadImage({
          buffer: prepared.buffer,
          filename: prepared.filename,
          mimeType: prepared.mimeType,
          purpose: args.purpose,
          ref: args.ref,
        });

        return okResult({
          url: uploaded.url,
          ref: uploaded.ref ?? null,
          filename: prepared.filename,
          mimeType: prepared.mimeType,
          optimized: prepared.optimized,
          ...(prepared.passthroughReason ? { passthroughReason: prepared.passthroughReason } : {}),
          originalBytes: prepared.originalBytes,
          finalBytes: prepared.finalBytes,
          ...(prepared.width !== undefined ? { width: prepared.width } : {}),
          ...(prepared.height !== undefined ? { height: prepared.height } : {}),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
