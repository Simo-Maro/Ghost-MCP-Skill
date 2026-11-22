export interface ContentWarning {
  code: string;
  severity: 'warning' | 'info';
  message: string;
}

export interface ContentValidationInput {
  title?: string;
  slug?: string;
  html?: string | null;
  lexical?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  custom_excerpt?: string | null;
  feature_image?: string | null;
  feature_image_alt?: string | null;
  canonical_url?: string | null;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertContentInvariants(input: ContentValidationInput): void {
  if (input.html !== undefined && input.lexical !== undefined) {
    throw new ValidationError(
      'Provide either "html" or "lexical", not both. Omit both to perform a metadata-only update.',
    );
  }

  if (input.title !== undefined && input.title.length > 255) {
    throw new ValidationError(
      `Field "title" exceeds Ghost's 255-character limit (got ${input.title.length}).`,
    );
  }

  if (typeof input.meta_title === 'string' && input.meta_title.length > 300) {
    throw new ValidationError(
      `Field "meta_title" exceeds Ghost's 300-character limit (got ${input.meta_title.length}).`,
    );
  }

  if (typeof input.meta_description === 'string' && input.meta_description.length > 500) {
    throw new ValidationError(
      `Field "meta_description" exceeds Ghost's 500-character limit (got ${input.meta_description.length}).`,
    );
  }

  if (typeof input.custom_excerpt === 'string' && input.custom_excerpt.length > 300) {
    throw new ValidationError(
      `Field "custom_excerpt" exceeds Ghost's 300-character limit (got ${input.custom_excerpt.length}).`,
    );
  }

  if (typeof input.feature_image_alt === 'string' && input.feature_image_alt.length > 191) {
    throw new ValidationError(
      `Field "feature_image_alt" exceeds Ghost's 191-character limit (got ${input.feature_image_alt.length}).`,
    );
  }

  if (typeof input.canonical_url === 'string' && input.canonical_url.trim() !== '') {
    try {
      const parsed = new URL(input.canonical_url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported protocol');
      }
    } catch {
      throw new ValidationError(
        `Field "canonical_url" must be a valid http:// or https:// URL (got "${input.canonical_url}").`,
      );
    }
  }

  if (typeof input.lexical === 'string') {
    try {
      const parsed = JSON.parse(input.lexical) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Not a JSON object');
      }
    } catch {
      throw new ValidationError('Field "lexical" must be a valid JSON string.');
    }
  }
}

const KEBAB_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const H1_TAG_REGEX = /<h1(?:\s[^>]*)?>/i;
const IMG_TAG_REGEX = /<img\b[^>]*>/gi;
const ALT_ATTR_REGEX = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const ANCHOR_REGEX = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const GENERIC_ANCHORS = new Set([
  'click here',
  'read more',
  'learn more',
  'more',
  'here',
  'link',
  'this link',
]);
const PLACEHOLDER_REGEX = /\b(?:TODO|TBD|FIXME|lorem\s+ipsum|coming\s+soon)\b/i;

export function analyzeContentWarnings(input: {
  title?: string | null;
  slug?: string | null;
  html?: string | null;
  meta_description?: string | null;
  feature_image?: string | null;
  feature_image_alt?: string | null;
}): ContentWarning[] {
  const warnings: ContentWarning[] = [];

  if (!input.meta_description || input.meta_description.trim() === '') {
    warnings.push({
      code: 'MISSING_META_DESCRIPTION',
      severity: 'warning',
      message: 'Missing meta_description. Add a concise 120-160 character summary for search snippets.',
    });
  }

  if (input.feature_image && (!input.feature_image_alt || input.feature_image_alt.trim() === '')) {
    warnings.push({
      code: 'MISSING_FEATURE_IMAGE_ALT',
      severity: 'warning',
      message: 'Feature Image is set without feature_image_alt. Add descriptive alt text (<= 191 chars) for accessibility and image SEO.',
    });
  }

  if (input.slug && !KEBAB_SLUG_REGEX.test(input.slug)) {
    warnings.push({
      code: 'NON_KEBAB_SLUG',
      severity: 'warning',
      message: `Slug "${input.slug}" is not lowercase kebab-case (e.g. "my-post-slug").`,
    });
  }

  const html = input.html ?? '';
  if (html) {
    if (H1_TAG_REGEX.test(html)) {
      warnings.push({
        code: 'BODY_CONTAINS_H1',
        severity: 'warning',
        message: 'Body HTML contains an <h1> tag. Ghost renders the Post/Page title as <h1>; start body headings at <h2>.',
      });
    }

    const imgTags = html.match(IMG_TAG_REGEX) ?? [];
    let missingAltCount = 0;
    for (const tag of imgTags) {
      const altMatch = ALT_ATTR_REGEX.exec(tag);
      const altText = (altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? '').trim();
      if (!altMatch || altText === '') {
        missingAltCount += 1;
      }
    }
    if (missingAltCount > 0) {
      warnings.push({
        code: 'INLINE_IMAGE_MISSING_ALT',
        severity: 'warning',
        message: `Found ${missingAltCount} inline <img> tag(s) missing descriptive alt text.`,
      });
    }

    const genericAnchorsFound = new Set<string>();
    let anchorMatch: RegExpExecArray | null;
    ANCHOR_REGEX.lastIndex = 0;
    while ((anchorMatch = ANCHOR_REGEX.exec(html)) !== null) {
      const text = (anchorMatch[1] ?? '').replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (GENERIC_ANCHORS.has(text)) {
        genericAnchorsFound.add(text);
      }
    }
    if (genericAnchorsFound.size > 0) {
      warnings.push({
        code: 'GENERIC_ANCHOR_TEXT',
        severity: 'warning',
        message: `Found generic link anchor text (${Array.from(genericAnchorsFound).join(', ')}). Use descriptive anchor text instead.`,
      });
    }
  }

  const combinedText = `${input.title ?? ''}\n${html.replace(/<[^>]+>/g, ' ')}`;
  const placeholderMatch = PLACEHOLDER_REGEX.exec(combinedText);
  if (placeholderMatch) {
    warnings.push({
      code: 'PLACEHOLDER_TEXT_DETECTED',
      severity: 'warning',
      message: `Detected placeholder text ("${placeholderMatch[0]}"). Replace placeholders before publishing.`,
    });
  }

  return warnings;
}
