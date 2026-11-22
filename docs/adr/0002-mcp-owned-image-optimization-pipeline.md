---
status: accepted
---

# Own deterministic image optimization inside the MCP upload tool

We embed `sharp` inside `ghost-cms-mcp`'s `upload_image` tool to convert static raster images to WebP (default `maxWidth: 1600`, `quality: 82`, auto-oriented with EXIF stripped) while passing through SVG, multi-frame animated GIF/WebP, and ICO untouched, rather than delegating image conversion to a shell script inside the `ghost-writing` skill.

## Considered Options

- **Shell script inside `skills/ghost-writing/scripts/`**: Rejected. Forces every blogger and AI agent environment (Linux, macOS, Windows) to install external binaries (`cwebp`, `imagemagick`, `ffmpeg`) and leaves unoptimized uploads unprotected whenever the MCP server is used without the skill.
- **Rely solely on Ghost's server-side image resizing**: Rejected. Ghost Admin API rejects `.avif` uploads outright, only caps width at 2000px, and does not guarantee WebP conversion on upload across custom themes that omit `{{img_url format="webp"}}`.

## Consequences

- Zero extra OS CLI dependencies for users running `npx -y ghost-cms-mcp`, and local `.avif` files are transparently converted to Ghost-compatible WebP when optimization is enabled.
- Slightly heavier `npx` install footprint due to prebuilt platform-specific `sharp`/libvips binaries; `sharp` is dynamically imported only inside `upload_image` when `optimize: true` so the MCP server cold-starts fast and never fails to boot if native binaries have an issue on a host machine (returning an actionable error with `optimize: false` guidance instead).
- Callers retain an explicit `optimize: false` escape hatch (which still validates against Ghost's accepted upload formats and rejects raw `.avif` with an actionable error) as well as optional `maxWidth` and `quality` overrides.
