# Editorial Profile Template & Onboarding Rubric

Save a Site's Editorial Profile to either:
- `./ghost-profile.md` (workspace-local; gitignored by default), or
- `~/.config/ghost-mcp/profiles/<site-hostname>.md` (user-global per Site hostname, e.g. `example.com.md`).

## Brief Onboarding Interview (When No Profile Exists)

When a Site has no Editorial Profile yet, review `get_site_info`, `list_tags`, and recent `list_posts`, then ask the user 4–6 concise questions:

1. **Niche & Core Pillars**: What are the 3–5 main topics your Site covers, and what is explicitly off-topic?
2. **Target Reader**: Who is your primary audience (experience level, role, goals)?
3. **Language & Editorial Voice**: What language/locale and tone do you want (e.g., practical & concise, analytical, conversational, formal)?
4. **Authorship & E-E-A-T**: Who is the author/publisher, and what first-hand experience or perspective should Posts reflect?
5. **Monetization & Constraints**: Are you targeting Google AdSense approval, affiliate disclosures, or specific custom theme templates (`custom_template`)?

Draft the completed profile below, show it to the user, and save it only after their approval.

---

## Template (`ghost-profile.md`)

```markdown
# Editorial Profile: <Site Title>

- **Site URL**: https://example.com
- **Primary Language & Locale**: English (en-US)
- **Monetization Goal**: Google AdSense compliant (human-reviewed Draft-first workflow)

## Niche & Content Pillars
- Core pillars: [e.g., Self-hosted DevOps, Linux Guides, Web Performance]
- Out of scope: [Topics to avoid]

## Target Audience
- Who they are: [e.g., Independent developers and small-site operators]
- Assumed knowledge: [e.g., Intermediate technical literacy]

## Editorial Voice & Style
- Tone: [e.g., Direct, evidence-backed, practical, zero fluff]
- Formatting preferences: [e.g., Short paragraphs, comparison tables, concrete CLI examples]
- Things to avoid: [e.g., Hype adjectives, unverified claims, generic intros]

## Authorship & E-E-A-T Identity
- Author / Brand perspective: [e.g., Written from first-hand engineering experience]
- Standard disclosures: [e.g., Affiliate or testing environment note if applicable]

## Ghost Taxonomy & Theme Conventions
- Preferred public Tags: [List canonical public Tags]
- Internal Tags: [e.g., #pillar, #needs-review]
- Slug convention: [e.g., Lowercase ASCII/English kebab-case (default), or localized slugs]
- Custom templates (`custom_template`): [e.g., null (default), or custom-guide.hbs]
```
