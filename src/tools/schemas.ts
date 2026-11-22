import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  pages: z.number(),
  total: z.number(),
  next: z.number().nullable(),
  prev: z.number().nullable(),
});

export const warningSchema = z.object({
  code: z.string(),
  severity: z.enum(['warning', 'info']),
  message: z.string(),
});

export const tagRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  visibility: z.enum(['public', 'internal']),
});

export const authorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  bio: z.string().nullable().optional(),
  profile_image: z.string().nullable().optional(),
});

export const contentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'scheduled']),
  featured: z.boolean(),
  visibility: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  url: z.string().optional(),
  custom_template: z.string().nullable(),
  excerpt: z.string().nullable(),
  tags: z.array(tagRefSchema),
  has_meta_title: z.boolean(),
  has_meta_description: z.boolean(),
  has_feature_image: z.boolean(),
  has_feature_image_alt: z.boolean(),
});

export const contentDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'scheduled']),
  featured: z.boolean(),
  visibility: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  published_at: z.string().nullable(),
  url: z.string().optional(),
  html: z.string().nullable().optional(),
  lexical: z.string().nullable().optional(),
  custom_excerpt: z.string().nullable(),
  excerpt: z.string().optional(),
  feature_image: z.string().nullable(),
  feature_image_alt: z.string().nullable(),
  feature_image_caption: z.string().nullable(),
  custom_template: z.string().nullable(),
  canonical_url: z.string().nullable(),
  meta_title: z.string().nullable(),
  meta_description: z.string().nullable(),
  og_image: z.string().nullable(),
  og_title: z.string().nullable(),
  og_description: z.string().nullable(),
  twitter_image: z.string().nullable(),
  twitter_title: z.string().nullable(),
  twitter_description: z.string().nullable(),
  codeinjection_head: z.string().nullable(),
  codeinjection_foot: z.string().nullable(),
  tags: z.array(tagRefSchema),
  authors: z.array(authorSummarySchema),
  show_title_and_feature_image: z.boolean().optional(),
});

export const tagInputSchema = z.union([
  z.string(),
  z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
  }),
]);

export const contentFormatSchema = z
  .enum(['html', 'lexical', 'both', 'metadata_only'])
  .default('html');

export const contentWriteFieldsShape = {
  slug: z.string().optional().describe('URL slug (lowercase kebab-case recommended).'),
  html: z
    .string()
    .optional()
    .describe('Clean semantic HTML body converted natively by Ghost via ?source=html. Mutually exclusive with lexical.'),
  lexical: z
    .string()
    .optional()
    .describe('Raw Ghost Lexical JSON string. Mutually exclusive with html.'),
  status: z
    .enum(['draft', 'published', 'scheduled'])
    .optional()
    .describe('Publication status. Defaults to "draft" on create.'),
  published_at: z
    .string()
    .nullable()
    .optional()
    .describe('ISO-8601 publication timestamp (required when status is "scheduled").'),
  featured: z.boolean().optional(),
  visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional(),
  tags: z
    .array(tagInputSchema)
    .optional()
    .describe('Tags to attach (tag names such as "SEO" or "#internal-tag", or tag objects).'),
  custom_excerpt: z.string().nullable().optional().describe('Custom excerpt (max 300 chars).'),
  feature_image: z.string().nullable().optional().describe('Feature Image URL.'),
  feature_image_alt: z.string().nullable().optional().describe('Feature Image alt text (max 191 chars).'),
  feature_image_caption: z.string().nullable().optional(),
  custom_template: z
    .string()
    .nullable()
    .optional()
    .describe('Custom theme template filename (e.g. "custom-landing.hbs") or null for default.'),
  canonical_url: z.string().nullable().optional().describe('Canonical URL (valid http/https URL).'),
  meta_title: z.string().nullable().optional().describe('SEO meta title (max 300 chars).'),
  meta_description: z.string().nullable().optional().describe('SEO meta description (max 500 chars).'),
  og_image: z.string().nullable().optional(),
  og_title: z.string().nullable().optional(),
  og_description: z.string().nullable().optional(),
  twitter_image: z.string().nullable().optional(),
  twitter_title: z.string().nullable().optional(),
  twitter_description: z.string().nullable().optional(),
  codeinjection_head: z.string().nullable().optional(),
  codeinjection_foot: z.string().nullable().optional(),
};

export const tagDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  feature_image: z.string().nullable(),
  visibility: z.enum(['public', 'internal']),
  meta_title: z.string().nullable(),
  meta_description: z.string().nullable(),
  og_image: z.string().nullable(),
  og_title: z.string().nullable(),
  og_description: z.string().nullable(),
  twitter_image: z.string().nullable(),
  twitter_title: z.string().nullable(),
  twitter_description: z.string().nullable(),
  codeinjection_head: z.string().nullable(),
  codeinjection_foot: z.string().nullable(),
  canonical_url: z.string().nullable(),
  accent_color: z.string().nullable(),
  url: z.string().optional(),
  post_count: z.number().optional(),
});
