---
name: ghost-writing
description: Research, write, optimize, and publish SEO-ready, Google AdSense-compliant Posts and Pages on a self-hosted Ghost 6.x Site using ghost-cms-mcp. Use when drafting or updating Ghost Posts or Pages, auditing a Site for AdSense readiness, preparing Feature Images, or creating a Site Editorial Profile.
license: MIT
metadata:
  author: Simo-Maro
  version: "0.1.0"
---

# Ghost Writing Skill

Write accurate, original, SEO-ready, and Google AdSense-compliant Posts and Pages for a self-hosted Ghost `6.x` Site using the connected `ghost-cms-mcp` tools.

> Use the canonical MCP tool names below regardless of any client-specific tool prefix (for example, `mcp__ghost__create_post` or `create_post`).

## 1. Orient to the Connected Site & Editorial Profile

Before drafting any Post or Page:

1. Call `get_site_info` to confirm the connected Site's title, description, URL, and hostname.
2. Call `list_tags` (with `includePostCount: true`) and `list_posts` (`limit: 15`, `order: "published_at desc"`) to understand existing taxonomy, tone, and internal linking targets.
3. Resolve the Site's **Editorial Profile** in order:
   - First check `./ghost-profile.md` in the current workspace.
   - Next check `~/.config/ghost-mcp/profiles/<site-hostname>.md` (using the hostname from `get_site_info.url`, e.g., `example.com.md`).
4. **Graceful fallback & onboarding when no Editorial Profile exists**:
   - Never block or fail if neither file exists. Infer niche, language, and tone from `get_site_info`, existing Tags, recent Posts, and the user's prompt so you can still complete the task smoothly.
   - At a natural point (either before drafting or alongside the finished Draft), suggest creating a tailored Editorial Profile for the Site: offer to run a brief 4–6 question interview paired with a quick review of their existing Posts/Tags, then draft and save the Editorial Profile using [references/editorial-profile-template.md](references/editorial-profile-template.md) **only after the user reviews and approves it**.

## 2. Live Primary-Source Research (No Guessing)

Every factual claim, statistic, version number, release date, pricing detail, or policy statement must be verified against current primary sources (official documentation, standards bodies, vendor changelogs, or peer-reviewed/first-party data):

- Use whatever live web search and page-fetching capabilities your environment provides.
- **If live web search is disabled, offline, or restricted to a stale cache**: stop and inform the user before inventing facts. Either ask the user to supply primary sources/notes or proceed strictly with verified facts from the user's input and clearly mark any unverified sections as needing human verification before publishing.
- Synthesize original value: add structure, concrete examples, comparisons, edge cases, and clear takeaways ("Who, How, Why" E-E-A-T). Never paraphrase a single competitor article or publish thin summaries.

## 3. Authoring & Ghost 6.x HTML Formatting

Follow [references/ghost-html-formatting.md](references/ghost-html-formatting.md) when producing the `html` field for `create_post`, `update_post`, `create_page`, or `update_page`:

- Start body headings at `<h2>` and nest cleanly (`<h2>` → `<h3>`). Never put `<h1>` inside body HTML (Ghost renders the title as `<h1>`).
- Keep paragraphs scannable, use semantic `<ul>`/`<ol>`/`<table>`/`<pre><code>` blocks, and use descriptive anchor text (never `"click here"` or `"read more"`).
- Wrap every inline image in `<figure><img src="..." alt="Descriptive alt text"><figcaption>...</figcaption></figure>`.
- When updating metadata only (such as SEO fields, Tags, or `custom_template`), omit both `html` and `lexical` on `update_post` / `update_page` so the existing Lexical body is preserved untouched.
- Always pass the latest `updated_at` timestamp from `get_post` / `get_page` on updates.

## 4. Feature Images & Media Hygiene

When attaching a Feature Image or inline visual from disk:

1. Call `upload_image` with a descriptive SEO `filename` (lowercase kebab-case, e.g. `ghost-v6-architecture-diagram.webp`).
2. Leave `optimize: true` (the default) so static rasters (including `.avif`) are automatically converted to compressed WebP (`maxWidth: 1600`, `quality: 82`, auto-oriented, EXIF stripped) while SVG, multi-frame animated GIF/WebP, and ICO (`purpose: "icon"`) pass through untouched.
3. Always write a concise, descriptive `feature_image_alt` (≤ 191 characters) and descriptive `alt` text on every inline `<img>`.

## 5. SEO, Taxonomy & Google AdSense Compliance

Consult [references/seo-and-adsense-checklist.md](references/seo-and-adsense-checklist.md) before saving or publishing:

- Complete `meta_title` (50–60 chars recommended, ≤ 300 hard cap), `meta_description` (120–160 chars recommended, ≤ 500 hard cap), `custom_excerpt` (≤ 300 chars), lowercase kebab-case `slug`, and `feature_image_alt` (≤ 191 chars).
- Reuse existing public Tags from `list_tags` whenever possible. Avoid creating single-post public Tags (thin tag archive pages); use `#internal` Tags for private organization.
- Add 2–4 contextual internal links to relevant published Posts/Pages on the Site using descriptive anchor text.
- Respect Google AdSense publisher policies: original human-reviewed value, zero placeholder text (`TODO`, `TBD`, `lorem ipsum`), accurate disclosures, and no prohibited content categories.
- When asked to check Site-wide AdSense readiness, run `audit_site_readiness` (pass `checkLiveEndpoints: false` for local/staging Sites) and prioritize fixing all `blocker` findings before `warning` findings.

## 6. Draft-First Publishing Workflow

- **Interactive sessions (default)**: Always create new Posts and Pages with `status: "draft"`. After `create_post` / `create_page` / `update_post` / `update_page`, inspect the returned `warnings[]` and fix any actionable warnings. Then present a concise review summary to the user:
  - Title, slug, status (`draft`), Tags, and `custom_template` (if set)
  - SEO `meta_title`, `meta_description`, and Feature Image + `alt`
  - Verified primary sources used
  - Remaining `warnings[]` (if any) and confirmation before changing status to `published` or `scheduled`
- **Explicit automated publishing**: Only pass `status: "published"` or `status: "scheduled"` directly when the user explicitly requests automated live publishing **and** all factual checks, metadata fields, and placeholder checks have passed with zero blockers.
