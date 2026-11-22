import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';
import { TEST_API_KEY } from './helpers/mcp-harness.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = join(REPO_ROOT, 'dist', 'cli.js');
const SKILL_DIR = join(REPO_ROOT, 'skills', 'ghost-writing');
const SKILL_MD_PATH = join(SKILL_DIR, 'SKILL.md');

describe('Boundary smoke checks: stdio CLI, skill validator, and tarball hygiene', () => {
  it('spawns built CLI over real stdio, logs only to stderr, honors --read-only and --draft-only', async () => {
    expect(existsSync(CLI_PATH)).toBe(true);

    const readOnlyTransport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH, '--read-only'],
      env: {
        ...process.env,
        GHOST_URL: 'https://example.ghost.test',
        GHOST_ADMIN_API_KEY: TEST_API_KEY,
      },
      stderr: 'pipe',
    });

    let stderrText = '';
    readOnlyTransport.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString('utf8');
    });

    const readOnlyClient = new Client({ name: 'stdio-smoke-client', version: '1.0.0' });
    await readOnlyClient.connect(readOnlyTransport);
    try {
      const { tools } = await readOnlyClient.listTools();
      expect(tools).toHaveLength(8);
      expect(tools[0]?.name).toBe('get_site_info');
      expect(tools[1]?.name).toBe('audit_site_readiness');
      expect(stderrText).toContain('mode: read-only');
      expect(stderrText).not.toContain(TEST_API_KEY);
    } finally {
      await readOnlyClient.close();
    }

    const draftOnlyTransport = new StdioClientTransport({
      command: process.execPath,
      args: [CLI_PATH, '--draft-only'],
      env: {
        ...process.env,
        GHOST_URL: 'https://example.ghost.test',
        GHOST_ADMIN_API_KEY: TEST_API_KEY,
      },
      stderr: 'pipe',
    });

    const draftOnlyClient = new Client({ name: 'stdio-draft-client', version: '1.0.0' });
    await draftOnlyClient.connect(draftOnlyTransport);
    try {
      const { tools } = await draftOnlyClient.listTools();
      expect(tools).toHaveLength(15);
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('delete_post');
      expect(names).not.toContain('delete_page');
      expect(names).not.toContain('delete_tag');
    } finally {
      await draftOnlyClient.close();
    }
  });

  it('rejects insecure remote http:// at CLI startup without leaking the API key', async () => {
    let failed = false;
    let stderr = '';
    try {
      await execFileAsync(process.execPath, [CLI_PATH], {
        env: {
          ...process.env,
          GHOST_URL: 'http://remote.example.com',
          GHOST_ADMIN_API_KEY: TEST_API_KEY,
        },
        timeout: 5000,
      });
    } catch (err) {
      failed = true;
      stderr = (err as { stderr?: string }).stderr ?? '';
    }
    expect(failed).toBe(true);
    expect(stderr).toMatch(/--allow-insecure-http/i);
    expect(stderr).not.toContain(TEST_API_KEY);
  });

  it('validates skills/ghost-writing/SKILL.md for cross-agent portability and link integrity', async () => {
    const content = await readFile(SKILL_MD_PATH, 'utf8');
    const lines = content.split(/\r?\n/);
    expect(lines.length).toBeLessThan(500);

    // Frontmatter extraction
    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
    expect(fmMatch).not.toBeNull();
    const frontmatter = fmMatch![1]!;
    const body = fmMatch![2]!;

    // Extract top-level frontmatter keys
    const topKeys = frontmatter
      .split(/\r?\n/)
      .filter((l) => /^[a-zA-Z0-9_-]+:/.test(l))
      .map((l) => l.split(':')[0]!.trim());

    expect(topKeys).toEqual(expect.arrayContaining(['name', 'description', 'license', 'metadata']));
    for (const key of topKeys) {
      expect(['name', 'description', 'license', 'metadata']).toContain(key);
    }
    expect(frontmatter).not.toMatch(/^compatibility:/m);
    expect(frontmatter).not.toMatch(/^allowed-tools:/m);
    expect(frontmatter).toMatch(/^name:\s*ghost-writing$/m);

    // No client-specific syntax leaks in body
    expect(body).not.toContain('${CLAUDE_SKILL_DIR}');
    expect(body).not.toContain('$ARGUMENTS');
    expect(body).not.toMatch(/!`[^`]+`/);

    // Verify all relative markdown links resolve one level deep under references/
    const linkMatches = Array.from(body.matchAll(/\[[^\]]+\]\((references\/[^)]+)\)/g));
    expect(linkMatches.length).toBeGreaterThanOrEqual(3);
    for (const match of linkMatches) {
      const relPath = match[1]!;
      expect(relPath.split('/').length).toBe(2);
      expect(existsSync(join(SKILL_DIR, relPath))).toBe(true);
    }
  });

  it('npm pack --dry-run includes only dist/, README.md, LICENSE, and package.json', async () => {
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
      cwd: REPO_ROOT,
      timeout: 15000,
    });
    const parsed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const filePaths = parsed[0]?.files.map((f) => f.path) ?? [];
    expect(filePaths.length).toBeGreaterThan(0);

    for (const p of filePaths) {
      const allowed =
        p === 'package.json' ||
        p === 'README.md' ||
        p === 'LICENSE' ||
        p.startsWith('dist/');
      expect(allowed, `Unexpected file in npm tarball: ${p}`).toBe(true);
    }
    expect(filePaths).toContain('dist/cli.js');
    expect(filePaths).toContain('README.md');
    expect(filePaths).toContain('LICENSE');
  });
});
