# AGENTS.md

Project guidance for AI agents working in `Simo-Maro/Ghost-MCP-Skill`.

## Domain Docs

- Read `GLOSSARY.md` before exploring or writing code, specs, or docs, and stick to its canonical terms (`Site`, `Post`, `Page`, `Draft`, `Tag`, `Editorial Profile`, `Feature Image`, `Readiness Audit`).
- Read relevant ADRs in `docs/adr/` before changing architecture or boundaries. Flag any conflict with an existing ADR explicitly rather than overriding it silently.

## Issue Tracker & Governance

- Issues and specs are tracked in GitHub Issues (`Simo-Maro/Ghost-MCP-Skill`) via the `gh` CLI.
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
- Public contributions are **Issues-only** (no public Pull Requests).

## Scope Boundaries

- Target Ghost Admin API `v6.0` (`Accept-Version: v6.0`) with explicit pagination (never `limit=all`).
- Keep Members, Newsletters, Invites, Tiers, Users, Offers, Roles, Webhooks, site-wide Settings writes, and Theme management out of scope.
- Never commit `.env*`, API keys, local Editorial Profiles (`ghost-profile.md`), or personal drafts/scratchpads.
