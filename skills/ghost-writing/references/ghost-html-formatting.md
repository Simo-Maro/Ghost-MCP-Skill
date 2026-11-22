# Ghost 6.x HTML Formatting Reference (`?source=html`)

`ghost-cms-mcp` sends the `html` field to Ghost Admin API `v6.0` with `?source=html`, which Ghost natively converts into Lexical cards. Use clean semantic HTML to get reliable rendering across all Ghost themes.

## Headings & Structure

- Start body sections with `<h2>` and subsections with `<h3>` / `<h4>`.
- Never include `<h1>` in body HTML (Ghost renders the Post/Page title as `<h1>`).
- Keep paragraphs focused (2–4 sentences) for mobile readability.

## Inline Images & Figures

Wrap inline images in `<figure>` so Ghost converts them into native Lexical Image cards:

```html
<figure class="kg-card kg-image-card kg-card-hascaption">
  <img src="https://your-site.example/content/images/2026/11/diagram.webp" class="kg-image" alt="Descriptive alt text explaining the diagram">
  <figcaption>Concise caption attributing or explaining the visual.</figcaption>
</figure>
```

## Code Blocks

Use `<pre><code class="language-...">` with HTML-escaped angle brackets:

```html
<pre><code class="language-typescript">const status = 'draft';</code></pre>
```

## Tables & Lossless HTML Cards

Ghost automatically wraps standard `<table>` elements in HTML cards. For complex custom HTML that must be preserved verbatim, wrap it in Ghost's HTML card markers:

```html
<!--kg-card-begin: html-->
<table>
  <thead>
    <tr><th>Feature</th><th>Support</th></tr>
  </thead>
  <tbody>
    <tr><td>Ghost 6.x Pagination</td><td>Explicit page &amp; limit</td></tr>
  </tbody>
</table>
<!--kg-card-end: html-->
```

## Callout Cards

```html
<div class="kg-card kg-callout-card kg-callout-card-grey">
  <div class="kg-callout-emoji">💡</div>
  <div class="kg-callout-text">Key takeaway or practical tip for readers.</div>
</div>
```

## Metadata-Only Updates

When calling `update_post` or `update_page` to edit only SEO fields, Tags, `feature_image`, or `custom_template`, **omit both `html` and `lexical`**. `ghost-cms-mcp` will omit `?source=html` so Ghost never re-parses or alters the existing Lexical document.

## Supplementary JSON-LD (`codeinjection_head`)

Ghost `6.x` emits `Article` structured data (`application/ld+json`) automatically for Posts and Pages—**never duplicate `Article` or `BlogPosting` JSON-LD** in `codeinjection_head`.

Only inject supplementary JSON-LD via `codeinjection_head` when the Post or Page contains matching visible content (such as an explicit FAQ section or step-by-step instructions):

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Visible question from the Post body",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Matching concise answer visible in the Post body."
      }
    }
  ]
}
</script>
```

Keep supplementary schema strictly faithful to visible on-page text (Google Search spam policies penalize hidden or mismatched structured data).
