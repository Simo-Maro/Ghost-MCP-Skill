---
status: accepted
---

# Build from scratch with a native Ghost v6.0 client and MCP SDK v2

We will build `ghost-cms-mcp` from scratch in strict ESM TypeScript on `@modelcontextprotocol/server@2.4.0` (supporting both MCP `2026-07-28` and legacy `2025-11-25` clients) with a custom native `fetch` + `node:crypto` HS256 JWT client targeting Ghost Admin API `Accept-Version: v6.0`, rather than forking an existing Ghost MCP server or wrapping `@tryghost/admin-api`.

## Considered Options

- **Fork `MFYDev/ghost-mcp`**: Rejected. Effectively unmaintained since April 2026, legacy CommonJS + MCP SDK v1 + Zod v3, crashes on Ghost `v6.0` and Node 24+ (`SlowBuffer`), lacks tests, Pages CRUD, and image upload, and ~75% of its modules are out-of-scope membership/newsletter entities.
- **Fork `OksigeniaSL/oksigenia-ghost-mcp`**: Rejected. Tightly coupled to `@oksigenia/ghost-md-publisher` and Xpresiva-theme conventions, lacks Pages CRUD, Tag writes, deletes, raw HTML/Lexical authoring, and SEO/OG/Twitter/canonical/code-injection fields, uses legacy MCP SDK v1, and relies on Ghost's removed `limit: 'all'` pagination behavior.
- **Wrap `@tryghost/admin-api`**: Rejected. Ships CommonJS-only with no TypeScript `.d.ts` definitions, pulls in `axios`, `form-data`, and `jsonwebtoken`, mutates caller input objects, and lacks native `FormData`/`Blob` upload ergonomics.

## Consequences

- We own our typed Ghost `v6.0` client (~150–250 LOC) with explicit pagination (never `limit=all`), optimistic-lock `updated_at` handling, and strict exclusion of Members, Newsletters, Invites, Tiers, and Users.
- Ghost Admin API breaking changes in future major versions will require updating our thin client directly instead of waiting on an upstream wrapper.
