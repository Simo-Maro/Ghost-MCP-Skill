# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `ghost-cms-mcp` or `ghost-writing`, please do **not** post live credentials or exploit details in a public GitHub Issue. Instead, open a private GitHub Security Advisory on `Simo-Maro/Ghost-MCP-Skill` (Repository → Security → Advisories → Report a vulnerability).

## Security Practices Built Into `ghost-cms-mcp`

- **Local-only stdio transport**: `ghost-cms-mcp` never opens a listening network port and never proxies your Ghost Admin API key through a third-party server.
- **HTTPS by default**: Remote `GHOST_URL` origins require `https://`. Only `http://localhost` and `http://127.0.0.1` are auto-allowed; private LAN/Tailscale HTTP requires opting in explicitly via `--allow-insecure-http`.
- **No secret logging**: `GHOST_ADMIN_API_KEY` is validated locally and never logged to `stdout`, `stderr`, or error responses.
- **Optional filesystem jail**: Set `GHOST_UPLOAD_ROOT` to confine `upload_image` to a dedicated local media directory.
- **Lock-down flags**: Use `--read-only` to hide all mutating tools, or `--draft-only` to hide all `delete_*` tools and prevent modifying or publishing live Posts and Pages.
