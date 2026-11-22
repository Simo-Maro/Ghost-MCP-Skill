# SEO & Google AdSense Readiness Checklist

Grounded in Google Search Central (Search Essentials, Helpful Content, Using Gen AI Content, Spam Policies) and Google AdSense Program Policies.

## 1. Site-Wide AdSense Prerequisites

Use `audit_site_readiness` to verify these automatically:

- **HTTPS**: Serve the public Site over `https://`.
- **Privacy Policy Page (Mandatory for AdSense)**:
  - Must disclose that third-party vendors, including Google, use cookies to serve ads based on prior visits.
  - Must explain how users can opt out of personalized advertising with working links to:
    - `https://www.google.com/settings/ads` (or `https://adssettings.google.com`)
    - `https://www.aboutads.info/choices/`
    - `https://www.google.com/policies/privacy/partners/`
  - If serving EEA, UK, or Switzerland visitors, configure a Google-certified TCF Consent Management Platform (CMP).
- **Trust & E-E-A-T Pages (Strongly Recommended)**:
  - **About Page**: Who publishes the Site, editorial expertise, and how content is researched and reviewed.
  - **Contact Page**: Clear way for readers and reviewers to contact the Site owner.
  - **Author Profiles**: Complete author bio and profile image in Ghost Admin (inspected via `include=authors`).
- **Crawler Files**:
  - `/robots.txt` must **not** disallow `Googlebot` or `Mediapartners-Google`.
  - `/sitemap.xml` should return HTTP `200` (Ghost generates this automatically).
  - `/ads.txt`: After AdSense approval, serve `ads.txt` from the active Ghost theme root (`content/themes/<theme>/ads.txt`) or via your reverse proxy/CDN.

## 2. Per-Post & Per-Page Quality Gate

Before moving a Draft to `published` or `scheduled`:

- **Original Value & Human Review**: AdSense prohibits ads on automatically generated content without manual review or curation, and Search enforces the Scaled Content Abuse policy. Every Post must provide verified, original synthesis reviewed by a human.
- **Title & Slug**: Clear, specific `title` (≤ 255 chars; ~50–65 chars for search display) and clean lowercase kebab-case `slug`.
- **SEO Metadata**:
  - `meta_title`: 50–60 chars recommended (≤ 300 hard cap), unique across the Site.
  - `meta_description`: 120–160 chars recommended (≤ 500 hard cap), unique across the Site.
  - `custom_excerpt`: Concise 1–2 sentence summary (≤ 300 chars).
  - `canonical_url`: Leave `null` unless syndicating from an original external URL (Ghost emits self-referencing canonicals automatically).
- **Heading & Link Hygiene**:
  - Body starts at `<h2>` (no `<h1>` in body HTML).
  - 2–4 contextual internal links to related published Posts/Pages using descriptive anchor text.
  - Zero generic anchors (`"click here"`, `"read more"`) and zero placeholders (`TODO`, `TBD`, `lorem ipsum`, `coming soon`).
- **Media Hygiene**:
  - Feature Image uploaded via `upload_image` (WebP optimized, ≤ 1600px wide, EXIF stripped) with descriptive `feature_image_alt` (≤ 191 chars).
  - Every inline `<img>` has descriptive `alt` text.
- **Taxonomy Hygiene**:
  - Reuse existing public Tags; avoid 1-post public Tags that create thin archive pages.
  - Prefix internal organizational Tags with `#` (e.g., `#pillar-seo`).

## 3. Prohibited & Restricted AdSense Content Categories

Never publish content targeting AdSense monetization that falls under Google Publisher Policies or Publisher Restrictions:

- **Prohibited (ads disallowed)**:
  - Illegal content, intellectual property / copyright infringement, or pirated media/software instructions
  - Dangerous, derogatory, or hateful content; harassment; incitement to violence
  - Malware, unwanted software, or unauthorized hacking/cracking guides
  - Sexually explicit content, graphic violence, or shocking/grisly imagery
  - Deceptive, fabricated, or demonstrably false harmful claims (e.g., medical misinformation)
  - Scraped, spun, or auto-generated content published without meaningful original value and human review
- **Restricted (limited/reduced ad serving — flag to the Site owner before drafting)**:
  - Alcohol, tobacco, gambling/betting, adult/suggestive themes, weapons/explosives, prescription drugs/unapproved supplements, and sensitive/tragic events
