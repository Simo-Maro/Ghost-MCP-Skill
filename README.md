# Ghost-MCP-Skill

A local-first, open-source toolkit for self-hosted **Ghost `6.x`** Sites combining:

1. **`ghost-cms-mcp`**: A lean, strictly local (`npx`, stdio) MCP server targeting Ghost Admin API `v6.0` (`Accept-Version: v6.0`), focused exclusively on content operations — **Sites, Posts, Pages, Tags, Feature Images/media, and Site Readiness Audits** — with deterministic lazy-loaded `sharp` WebP optimization, `custom_template` support, safety lock-down flags, and structured SEO/AdSense guardrails.
2. **`ghost-writing`**: A cross-agent Agent Skill compatible with **Antigravity, Claude Code, Codex, and OpenCode** that guides AI agents through live primary-source research, Editorial Profile discovery (with graceful fallback & optional user-approved onboarding), Ghost HTML authoring, image hygiene, and Draft-first Google AdSense-compliant publishing.

## Requirements

- **Node.js `>= 20`**
- A self-hosted **Ghost `6.x`** Site (tested against Ghost `6.77.0-alpine`)
- A Ghost **Custom Integration Admin API Key** (`Settings → Integrations → Add custom integration`, format `<24-hex-id>:<64-hex-secret>` — never the Content API Key)

## Quick Start: Install `ghost-cms-mcp`

Each MCP server process connects to **one Site** via `GHOST_URL` and `GHOST_ADMIN_API_KEY`. To manage multiple Sites safely, register a separate named MCP server per Site.

### Antigravity (`~/.gemini/antigravity/mcp_config.json`)

```json
{
  "mcpServers": {
    "ghost": {
      "command": "npx",
      "args": ["-y", "ghost-cms-mcp"],
      "env": {
        "GHOST_URL": "https://your-site.example",
        "GHOST_ADMIN_API_KEY": "000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }
}
```

### Claude Code (`~/.claude.json` or `.mcp.json`)

```json
{
  "mcpServers": {
    "ghost": {
      "command": "npx",
      "args": ["-y", "ghost-cms-mcp"],
      "env": {
        "GHOST_URL": "https://your-site.example",
        "GHOST_ADMIN_API_KEY": "000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }
}
```

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.ghost]
command = "npx"
args = ["-y", "ghost-cms-mcp"]

[mcp_servers.ghost.env]
GHOST_URL = "https://your-site.example"
GHOST_ADMIN_API_KEY = "000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000"
```

### OpenCode (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ghost": {
      "type": "local",
      "command": ["npx", "-y", "ghost-cms-mcp"],
      "environment": {
        "GHOST_URL": "https://your-site.example",
        "GHOST_ADMIN_API_KEY": "000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  }
}
```

## Quick Start: Install the `ghost-writing` Skill

Install the cross-agent `ghost-writing` skill across Antigravity, Claude Code, Codex, or OpenCode using the Agent Skills CLI:

```bash
npx skills add Simo-Maro/Ghost-MCP-Skill --skill ghost-writing
```

### Optional: Site Editorial Profile

`ghost-writing` stays 100% generic and resolves your Site's **Editorial Profile** automatically in order:

1. `./ghost-profile.md` (workspace-local, gitignored)
2. `~/.config/ghost-mcp/profiles/<site-hostname>.md` (user-global keyed by the connected Site's hostname)

If neither file exists, `ghost-writing` degrades gracefully using live `get_site_info`, existing Tags, recent Posts, and your prompt — and offers a brief interview + Site review to create a tailored Editorial Profile with your approval.

## Safety Flags & Environment Variables

| Option | Effect |
| --- | --- |
| `--read-only` | Hides all mutating tools from `tools/list` (only the 8 read-only tools are registered). |
| `--draft-only` | Omits `delete_post`, `delete_page`, and `delete_tag`; restricts creates to `status: "draft"`; blocks updates targeting already `published` or `scheduled` Posts/Pages. |
| `--allow-insecure-http` | Explicitly allows `http://` for non-local LAN/Tailscale hosts (`http://localhost` and `http://127.0.0.1` are auto-allowed; remote hosts require `https://` by default). |
| `GHOST_UPLOAD_ROOT` | Optional directory jail restricting `upload_image` to local files inside that directory. |

## Scoped 18-Tool Surface

| Category | Tools | Highlights |
| --- | --- | --- |
| **Site & Readiness Audit (2)** | `get_site_info`, `audit_site_readiness` | Site orientation + compact SEO/AdSense Readiness Audit with toggleable (`checkLiveEndpoints`) short-timeout HTTP probes. |
| **Posts (5)** | `list_posts`, `get_post`, `create_post`, `update_post`, `delete_post` | Explicit pagination (never `limit=all`), `id` or `slug` lookup, `html`/`lexical`/`both`/`metadata_only` formats, safe metadata-only updates without `?source=html`, `updated_at` optimistic locking, `custom_template`, and non-blocking `warnings[]`. |
| **Pages (5)** | `list_pages`, `get_page`, `create_page`, `update_page`, `delete_page` | Symmetric Page CRUD plus `show_title_and_feature_image` and `custom_template`. |
| **Tags (5)** | `list_tags`, `get_tag`, `create_tag`, `update_tag`, `delete_tag` | Public & `#internal` Tags, optional `includePostCount`, full Tag SEO/social/code-injection fields. |
| **Media (1)** | `upload_image` | Lazy-loaded `sharp` WebP conversion (`maxWidth: 1600`, `quality: 82`, EXIF stripped), auto `.avif` → `.webp` rescue, untouched passthrough for SVG, multi-frame animated GIF/WebP, and ICO (`purpose: "icon"`), plus `optimize: false` escape hatch. |

### Out of Scope by Design

Members, Newsletters, Invites, Tiers, Users, Offers, Roles, Webhooks, site-wide Settings writes, and Theme management are intentionally excluded.

## Google AdSense Readiness Guide

Run `audit_site_readiness` on your connected Site (pass `checkLiveEndpoints: false` for local Docker or staging Sites) to check:

- **HTTPS** on the public Site URL
- **Privacy Policy Page** containing mandatory third-party/Google cookie disclosures and opt-out/partner links (`google.com/settings/ads`, `aboutads.info/choices/`, `google.com/policies/privacy/partners/`)
- **About & Contact Pages** and **Author E-E-A-T profiles** (bio + profile image, inspected via Post `include=authors`)
- **Duplicate `meta_title` / `meta_description`** and **thin 1-post public Tags**
- **Live crawler files**: `/robots.txt` (ensuring `Googlebot` and `Mediapartners-Google` are allowed), `/sitemap.xml`, and `/ads.txt`

## Development & Manual Release Checklist

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm test
npm pack --dry-run
```

Before manually publishing a new version to npm (`npm publish`):
1. Confirm `npm run prepublishOnly` passes cleanly on Node 20 and 22.
2. Confirm `npm pack --dry-run` contains **only** `dist/`, `README.md`, `LICENSE`, and `package.json`.
3. Tag the release and run `npm publish --access public`.

## Contributing (Issues Only)

Public contributions to this repository are **GitHub Issues only** — we do **not** accept public Pull Requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for bug report and feature request guidelines, and [SECURITY.md](SECURITY.md) for security disclosures.

## License

MIT — see [LICENSE](LICENSE).
