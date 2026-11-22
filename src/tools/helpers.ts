import type { GhostContentBase, GhostPage, GhostTag } from '../ghost/types.js';

export function okResult<T extends Record<string, unknown>>(structuredContent: T) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: message,
      },
    ],
  };
}

export function formatsParamFor(format: 'html' | 'lexical' | 'both' | 'metadata_only'): string | undefined {
  switch (format) {
    case 'html':
      return 'html';
    case 'lexical':
      return 'lexical';
    case 'both':
      return 'html,lexical';
    case 'metadata_only':
      return undefined;
  }
}

export function toContentSummary(item: GhostContentBase) {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    status: item.status,
    featured: item.featured,
    visibility: item.visibility,
    created_at: item.created_at,
    updated_at: item.updated_at,
    published_at: item.published_at,
    url: item.url,
    custom_template: item.custom_template ?? null,
    excerpt: item.custom_excerpt ?? item.excerpt ?? null,
    tags: (item.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      visibility: t.visibility,
    })),
    has_meta_title: Boolean(item.meta_title?.trim()),
    has_meta_description: Boolean(item.meta_description?.trim()),
    has_feature_image: Boolean(item.feature_image?.trim()),
    has_feature_image_alt: Boolean(item.feature_image_alt?.trim()),
  };
}

export function toContentDetail(
  item: GhostContentBase | GhostPage,
  format: 'html' | 'lexical' | 'both' | 'metadata_only',
) {
  const base: Record<string, unknown> = {
    id: item.id,
    title: item.title,
    slug: item.slug,
    status: item.status,
    featured: item.featured,
    visibility: item.visibility,
    created_at: item.created_at,
    updated_at: item.updated_at,
    published_at: item.published_at,
    url: item.url,
    custom_excerpt: item.custom_excerpt ?? null,
    excerpt: item.excerpt,
    feature_image: item.feature_image ?? null,
    feature_image_alt: item.feature_image_alt ?? null,
    feature_image_caption: item.feature_image_caption ?? null,
    custom_template: item.custom_template ?? null,
    canonical_url: item.canonical_url ?? null,
    meta_title: item.meta_title ?? null,
    meta_description: item.meta_description ?? null,
    og_image: item.og_image ?? null,
    og_title: item.og_title ?? null,
    og_description: item.og_description ?? null,
    twitter_image: item.twitter_image ?? null,
    twitter_title: item.twitter_title ?? null,
    twitter_description: item.twitter_description ?? null,
    codeinjection_head: item.codeinjection_head ?? null,
    codeinjection_foot: item.codeinjection_foot ?? null,
    tags: (item.tags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      visibility: t.visibility,
    })),
    authors: (item.authors ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      bio: a.bio ?? null,
      profile_image: a.profile_image ?? null,
    })),
  };

  if (format === 'html' || format === 'both') {
    base.html = item.html ?? null;
  }
  if (format === 'lexical' || format === 'both') {
    base.lexical = item.lexical ?? null;
  }
  if ('show_title_and_feature_image' in item && item.show_title_and_feature_image !== undefined) {
    base.show_title_and_feature_image = item.show_title_and_feature_image;
  }

  return base;
}

export function toTagDetail(tag: GhostTag) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description ?? null,
    feature_image: tag.feature_image ?? null,
    visibility: tag.visibility,
    meta_title: tag.meta_title ?? null,
    meta_description: tag.meta_description ?? null,
    og_image: tag.og_image ?? null,
    og_title: tag.og_title ?? null,
    og_description: tag.og_description ?? null,
    twitter_image: tag.twitter_image ?? null,
    twitter_title: tag.twitter_title ?? null,
    twitter_description: tag.twitter_description ?? null,
    codeinjection_head: tag.codeinjection_head ?? null,
    codeinjection_foot: tag.codeinjection_foot ?? null,
    canonical_url: tag.canonical_url ?? null,
    accent_color: tag.accent_color ?? null,
    url: tag.url,
    ...(tag.count ? { post_count: tag.count.posts } : {}),
  };
}

export function normalizeTagInputs(
  tags?: Array<string | { id?: string; name?: string; slug?: string }>,
) {
  if (!tags) return undefined;
  return tags.map((t) => (typeof t === 'string' ? { name: t } : t));
}

export function pickDefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
