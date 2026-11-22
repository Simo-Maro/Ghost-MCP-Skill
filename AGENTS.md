# AGENTS.md

Monorepo for two shipped deliverables (`v0.1.0`+):
- `ghost-cms-mcp` (`src/`, published on npm): local-only stdio MCP server with 18 deterministically ordered tools for self-hosted Ghost `6.x`.
- `ghost-writing` (`skills/ghost-writing/`): cross-agent editorial skill for Antigravity, Claude Code, Codex, and OpenCode.

## Context Pointers

- **Terminology** — Read `GLOSSARY.md` before exploring or writing code, specs, or docs; stick to its canonical terms (`Site`, `Post`, `Page`, `Draft`, `Tag`, `Editorial Profile`, `Feature Image`, `Readiness Audit`).
- **Ghost client, MCP SDK, or entity scope** — Read `docs/adr/0001-build-from-scratch-with-native-ghost-v6-client.md` before changing transport, auth, pagination, SDK usage, or supported entities.
- **Image upload or `sharp` pipeline** — Read `docs/adr/0002-mcp-owned-image-optimization-pipeline.md` before changing `upload_image`, raster conversion, or passthrough formats.
- Flag any conflict with an existing ADR explicitly rather than overriding it silently.

## Architecture & Guardrails

- **Content-only Ghost `v6.0` scope**: Target `Accept-Version: v6.0` with explicit `page` + `limit` pagination (never `limit=all`). Support Sites, Posts, Pages, Tags, Feature Images/media, and Readiness Audits; keep Members, Newsletters, Invites, Tiers, Users, Offers, Roles, Webhooks, site-wide Settings writes, and Themes out of scope.
- **Optimistic locking & body preservation**: Ghost `6.77.0` accepts stale `updated_at` on metadata-only `PUT`s, so `update_post` and `update_page` verify `updated_at` via a pre-`PUT` `GET`. Preserve that check, and omit `?source=html` on metadata-only updates so Lexical bodies remain untouched.
- **Stdio & lazy `sharp` boundaries**: Write all diagnostics to `stderr` (`stdout` carries MCP JSON-RPC only), keep `GHOST_ADMIN_API_KEY` out of all logs/outputs, and load `sharp` lazily inside `upload_image` only when `optimize: true` so the server boots without native binary failures.
- **Cross-agent skill portability**: Keep `skills/ghost-writing/SKILL.md` under 500 lines using only portable open-spec frontmatter (`name`, `description`, `license`, string-valued `metadata`); push detailed checklists and templates into `skills/ghost-writing/references/`.
- **Packaging & secret hygiene**: Keep `package.json` `"files"` whitelisted to `["dist", "README.md", "LICENSE"]`. Keep `.env*`, API keys, local Editorial Profiles (`ghost-profile.md`), and personal drafts untracked.

## Verification

- Run `npm run prepublishOnly` (`typecheck`, `lint`, `build`, `test`) before finishing code, skill, or packaging changes. `tests/boundary.test.ts` enforces the stdio CLI flags, `SKILL.md` portability, and `npm pack --dry-run` tarball whitelist.

## Issue Tracker & Governance

- Track issues and specs in GitHub Issues (`Simo-Maro/Ghost-MCP-Skill`) via the `gh` CLI.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- Public contributions are **Issues-only** (no public Pull Requests).
