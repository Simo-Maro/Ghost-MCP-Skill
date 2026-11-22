import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import {
  connectTestMcp,
  jsonResponse,
  TEST_API_KEY,
  verifyGhostJwt,
} from './helpers/mcp-harness.js';

const ALL_18_TOOLS = [
  'get_site_info',
  'audit_site_readiness',
  'list_posts',
  'get_post',
  'create_post',
  'update_post',
  'delete_post',
  'list_pages',
  'get_page',
  'create_page',
  'update_page',
  'delete_page',
  'list_tags',
  'get_tag',
  'create_tag',
  'update_tag',
  'delete_tag',
  'upload_image',
];

const READ_ONLY_TOOLS = [
  'get_site_info',
  'audit_site_readiness',
  'list_posts',
  'get_post',
  'list_pages',
  'get_page',
  'list_tags',
  'get_tag',
];

describe('config validation & transport security', () => {
  it('accepts https remote URL and normalizes trailing slashes', () => {
    const cfg = parseConfig({
      env: {
        GHOST_URL: 'https://news.example.com///',
        GHOST_ADMIN_API_KEY: TEST_API_KEY,
      },
      argv: [],
    });
    expect(cfg.ghostUrl).toBe('https://news.example.com');
    expect(cfg.readOnly).toBe(false);
    expect(cfg.draftOnly).toBe(false);
  });

  it('auto-allows http://localhost and http://127.0.0.1 but rejects remote http:// by default', () => {
    expect(
      parseConfig({
        env: { GHOST_URL: 'http://localhost:2368', GHOST_ADMIN_API_KEY: TEST_API_KEY },
        argv: [],
      }).ghostUrl,
    ).toBe('http://localhost:2368');

    expect(
      parseConfig({
        env: { GHOST_URL: 'http://127.0.0.1:2368/', GHOST_ADMIN_API_KEY: TEST_API_KEY },
        argv: [],
      }).ghostUrl,
    ).toBe('http://127.0.0.1:2368');

    expect(() =>
      parseConfig({
        env: { GHOST_URL: 'http://192.168.1.50:2368', GHOST_ADMIN_API_KEY: TEST_API_KEY },
        argv: [],
      }),
    ).toThrow(/--allow-insecure-http/i);

    expect(
      parseConfig({
        env: { GHOST_URL: 'http://192.168.1.50:2368', GHOST_ADMIN_API_KEY: TEST_API_KEY },
        argv: ['--allow-insecure-http'],
      }).allowInsecureHttp,
    ).toBe(true);
  });

  it('rejects malformed Admin API key without echoing the secret', () => {
    const badKey = 'not-hex:super-secret-value-12345';
    let caught: unknown;
    try {
      parseConfig({
        env: { GHOST_URL: 'https://example.com', GHOST_ADMIN_API_KEY: badKey },
        argv: [],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toMatch(/GHOST_ADMIN_API_KEY/i);
    expect(msg).not.toContain('super-secret-value-12345');
  });
});

describe('MCP tool surface, deterministic ordering, and get_site_info', () => {
  it('registers all 18 tools in deterministic order by default', async () => {
    const ctx = await connectTestMcp();
    try {
      const { tools } = await ctx.client.listTools();
      expect(tools.map((t) => t.name)).toEqual(ALL_18_TOOLS);
      const deletePost = tools.find((t) => t.name === 'delete_post');
      expect(deletePost?.annotations?.destructiveHint).toBe(true);
      const getSite = tools.find((t) => t.name === 'get_site_info');
      expect(getSite?.annotations?.readOnlyHint).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('hides all mutating tools when --read-only is enabled', async () => {
    const ctx = await connectTestMcp({ readOnly: true });
    try {
      const { tools } = await ctx.client.listTools();
      expect(tools.map((t) => t.name)).toEqual(READ_ONLY_TOOLS);
    } finally {
      await ctx.close();
    }
  });

  it('omits delete_* tools when --draft-only is enabled', async () => {
    const ctx = await connectTestMcp({ draftOnly: true });
    try {
      const { tools } = await ctx.client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).not.toContain('delete_post');
      expect(names).not.toContain('delete_page');
      expect(names).not.toContain('delete_tag');
      expect(names).toContain('create_post');
      expect(names).toContain('update_post');
    } finally {
      await ctx.close();
    }
  });

  it('calls get_site_info with valid HS256 JWT and Accept-Version: v6.0', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      verifyGhostJwt(req.headers.get('authorization'));
      expect(req.headers.get('accept-version')).toBe('v6.0');
      expect(req.url).toBe('https://example.ghost.test/ghost/api/admin/site/');
      return jsonResponse({
        site: {
          title: 'Tech Notes',
          description: 'Independent software notes',
          url: 'https://example.ghost.test/',
          logo: 'https://example.ghost.test/content/images/logo.png',
          icon: 'https://example.ghost.test/content/images/icon.png',
          version: '6.77.0',
        },
      });
    });

    try {
      const result = await ctx.client.callTool({ name: 'get_site_info', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        title: 'Tech Notes',
        description: 'Independent software notes',
        url: 'https://example.ghost.test/',
        logo: 'https://example.ghost.test/content/images/logo.png',
        icon: 'https://example.ghost.test/content/images/icon.png',
        version: '6.77.0',
      });
    } finally {
      await ctx.close();
    }
  });
});

function makeSamplePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    title: 'Ghost v6 Guide',
    slug: 'ghost-v6-guide',
    html: '<h2>Intro</h2><p>Clean content.</p>',
    lexical: '{"root":{"children":[]}}',
    feature_image: 'https://example.ghost.test/content/images/hero.webp',
    feature_image_alt: 'Ghost architecture diagram',
    feature_image_caption: null,
    featured: false,
    status: 'draft',
    visibility: 'public',
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-21T10:00:00.000Z',
    published_at: null,
    custom_excerpt: 'A concise excerpt',
    codeinjection_head: null,
    codeinjection_foot: null,
    custom_template: 'custom-feature.hbs',
    canonical_url: null,
    url: 'https://example.ghost.test/ghost-v6-guide/',
    og_image: null,
    og_title: null,
    og_description: null,
    twitter_image: null,
    twitter_title: null,
    twitter_description: null,
    meta_title: 'Ghost v6 Guide',
    meta_description: 'Complete guide to running Ghost v6 locally with MCP.',
    tags: [{ id: 'tag-1', name: 'Ghost', slug: 'ghost', visibility: 'public' }],
    authors: [
      {
        id: 'author-1',
        name: 'Jane Doe',
        slug: 'jane-doe',
        bio: 'Technical editor',
        profile_image: 'https://example.ghost.test/content/images/jane.webp',
      },
    ],
    ...overrides,
  };
}

describe('Posts and Pages CRUD, slug lookup, custom_template, metadata-only update, and warnings', () => {
  it('list_posts returns compact body-free summaries with explicit pagination', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      verifyGhostJwt(req.headers.get('authorization'));
      const url = new URL(req.url);
      expect(url.pathname).toBe('/ghost/api/admin/posts/');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('limit')).toBe('50');
      expect(url.searchParams.get('limit')).not.toBe('all');
      return jsonResponse({
        posts: [makeSamplePost()],
        meta: {
          pagination: { page: 2, limit: 50, pages: 3, total: 120, next: 3, prev: 1 },
        },
      });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'list_posts',
        arguments: { page: 2, limit: 50 },
      });
      expect(res.isError).toBeFalsy();
      const data = res.structuredContent as { posts: Array<Record<string, unknown>>; pagination: { total: number } };
      expect(data.pagination.total).toBe(120);
      expect(data.posts[0]?.html).toBeUndefined();
      expect(data.posts[0]?.lexical).toBeUndefined();
      expect(data.posts[0]?.custom_template).toBe('custom-feature.hbs');
      expect(data.posts[0]?.has_meta_description).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('get_post and get_page look up by slug via /slug/{slug}/ and support format options', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/ghost/api/admin/posts/slug/ghost-v6-guide/') {
        expect(url.searchParams.get('formats')).toBe('html,lexical');
        return jsonResponse({ posts: [makeSamplePost()] });
      }
      if (url.pathname === '/ghost/api/admin/pages/slug/about/') {
        expect(url.searchParams.get('formats')).toBeNull();
        return jsonResponse({
          pages: [
            makeSamplePost({
              id: 'page-1',
              title: 'About',
              slug: 'about',
              show_title_and_feature_image: false,
            }),
          ],
        });
      }
      return jsonResponse({ errors: [{ message: 'Not found' }] }, 404);
    });

    try {
      const postRes = await ctx.client.callTool({
        name: 'get_post',
        arguments: { slug: 'ghost-v6-guide', format: 'both' },
      });
      expect(postRes.isError).toBeFalsy();
      const post = (postRes.structuredContent as { post: Record<string, unknown> }).post;
      expect(post.html).toContain('Clean content');
      expect(post.lexical).toContain('root');
      expect(post.custom_template).toBe('custom-feature.hbs');

      const pageRes = await ctx.client.callTool({
        name: 'get_page',
        arguments: { slug: 'about', format: 'metadata_only' },
      });
      expect(pageRes.isError).toBeFalsy();
      const page = (pageRes.structuredContent as { page: Record<string, unknown> }).page;
      expect(page.html).toBeUndefined();
      expect(page.lexical).toBeUndefined();
      expect(page.show_title_and_feature_image).toBe(false);

      const badLookup = await ctx.client.callTool({
        name: 'get_post',
        arguments: { id: 'a', slug: 'b' },
      });
      expect(badLookup.isError).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('create_post defaults to draft, sends ?source=html, preserves custom_template, and surfaces non-blocking warnings[]', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      const url = new URL(req.url);
      expect(req.method).toBe('POST');
      expect(url.pathname).toBe('/ghost/api/admin/posts/');
      expect(url.searchParams.get('source')).toBe('html');
      const sent = JSON.parse(String(req.body)) as { posts: Array<Record<string, unknown>> };
      expect(sent.posts[0]?.status).toBe('draft');
      expect(sent.posts[0]?.custom_template).toBe('custom-wide.hbs');
      return jsonResponse({
        posts: [
          makeSamplePost({
            title: 'Draft TODO Post',
            slug: 'Bad_Slug',
            meta_description: null,
            feature_image_alt: null,
            custom_template: 'custom-wide.hbs',
            html: '<h1>Duplicate H1</h1><p><a href="https://example.com">click here</a><img src="/a.webp"></p>',
          }),
        ],
      });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'create_post',
        arguments: {
          title: 'Draft TODO Post',
          slug: 'Bad_Slug',
          custom_template: 'custom-wide.hbs',
          feature_image: 'https://example.ghost.test/content/images/hero.webp',
          html: '<h1>Duplicate H1</h1><p><a href="https://example.com">click here</a><img src="/a.webp"></p>',
        },
      });
      expect(res.isError).toBeFalsy();
      const data = res.structuredContent as {
        post: Record<string, unknown>;
        warnings: Array<{ code: string }>;
      };
      expect(data.post.custom_template).toBe('custom-wide.hbs');
      const codes = data.warnings.map((w) => w.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'MISSING_META_DESCRIPTION',
          'MISSING_FEATURE_IMAGE_ALT',
          'NON_KEBAB_SLUG',
          'BODY_CONTAINS_H1',
          'INLINE_IMAGE_MISSING_ALT',
          'GENERIC_ANCHOR_TEXT',
          'PLACEHOLDER_TEXT_DETECTED',
        ]),
      );
    } finally {
      await ctx.close();
    }
  });

  it('hard-rejects Ghost DB invariants and mutually exclusive html/lexical', async () => {
    const ctx = await connectTestMcp();
    try {
      const bothBodies = await ctx.client.callTool({
        name: 'create_post',
        arguments: {
          title: 'Conflict',
          html: '<p>hi</p>',
          lexical: '{"root":{}}',
        },
      });
      expect(bothBodies.isError).toBe(true);

      const longAlt = await ctx.client.callTool({
        name: 'create_post',
        arguments: {
          title: 'Long Alt',
          feature_image_alt: 'x'.repeat(192),
        },
      });
      expect(longAlt.isError).toBe(true);

      const badCanonical = await ctx.client.callTool({
        name: 'create_post',
        arguments: {
          title: 'Bad URL',
          canonical_url: 'not-a-url',
        },
      });
      expect(badCanonical.isError).toBe(true);
      expect(ctx.requests.length).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  it('update_post performs metadata-only update without ?source=html when html and lexical are omitted', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      const url = new URL(req.url);
      expect(req.method).toBe('PUT');
      expect(url.pathname).toBe('/ghost/api/admin/posts/post-1/');
      expect(url.searchParams.get('source')).toBeNull();
      const sent = JSON.parse(String(req.body)) as { posts: Array<Record<string, unknown>> };
      expect(sent.posts[0]?.updated_at).toBe('2026-11-21T10:00:00.000Z');
      expect(sent.posts[0]?.custom_template).toBeNull();
      expect(sent.posts[0]?.html).toBeUndefined();
      expect(sent.posts[0]?.lexical).toBeUndefined();
      return jsonResponse({
        posts: [makeSamplePost({ custom_template: null, meta_title: 'Updated SEO Title' })],
      });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'update_post',
        arguments: {
          id: 'post-1',
          updated_at: '2026-11-21T10:00:00.000Z',
          meta_title: 'Updated SEO Title',
          custom_template: null,
        },
      });
      expect(res.isError).toBeFalsy();
      const post = (res.structuredContent as { post: Record<string, unknown> }).post;
      expect(post.custom_template).toBeNull();
      expect(post.meta_title).toBe('Updated SEO Title');
    } finally {
      await ctx.close();
    }
  });

  it('--draft-only blocks publishing on create and blocks updating published Posts', async () => {
    const ctx = await connectTestMcp({ draftOnly: true }, (req) => {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/ghost/api/admin/posts/post-live/') {
        return jsonResponse({ posts: [makeSamplePost({ id: 'post-live', status: 'published' })] });
      }
      return jsonResponse({ posts: [makeSamplePost()] });
    });

    try {
      const createLive = await ctx.client.callTool({
        name: 'create_post',
        arguments: { title: 'Live Attempt', status: 'published' },
      });
      expect(createLive.isError).toBe(true);

      const updateLive = await ctx.client.callTool({
        name: 'update_post',
        arguments: {
          id: 'post-live',
          updated_at: '2026-11-21T10:00:00.000Z',
          meta_title: 'Sneaky edit',
        },
      });
      expect(updateLive.isError).toBe(true);
      // Only the GET status check should have fired, never PUT
      expect(ctx.requests.some((r) => r.method === 'PUT')).toBe(false);
    } finally {
      await ctx.close();
    }
  });
});

describe('Tags CRUD and audit_site_readiness', () => {
  it('supports get_tag by slug, create_tag for #internal tags, and delete_tag', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/ghost/api/admin/tags/slug/seo/') {
        return jsonResponse({
          tags: [
            {
              id: 'tag-seo',
              name: 'SEO',
              slug: 'seo',
              description: 'Search guides',
              feature_image: null,
              visibility: 'public',
              og_image: null,
              og_title: null,
              og_description: null,
              twitter_image: null,
              twitter_title: null,
              twitter_description: null,
              meta_title: null,
              meta_description: null,
              codeinjection_head: null,
              codeinjection_foot: null,
              canonical_url: null,
              accent_color: null,
              count: { posts: 4 },
            },
          ],
        });
      }
      if (req.method === 'POST' && url.pathname === '/ghost/api/admin/tags/') {
        return jsonResponse({
          tags: [
            {
              id: 'tag-int',
              name: '#pillar-seo',
              slug: 'hash-pillar-seo',
              description: null,
              feature_image: null,
              visibility: 'internal',
              og_image: null,
              og_title: null,
              og_description: null,
              twitter_image: null,
              twitter_title: null,
              twitter_description: null,
              meta_title: null,
              meta_description: null,
              codeinjection_head: null,
              codeinjection_foot: null,
              canonical_url: null,
              accent_color: null,
            },
          ],
        });
      }
      if (req.method === 'DELETE' && url.pathname === '/ghost/api/admin/tags/tag-int/') {
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ errors: [{ message: 'Not found' }] }, 404);
    });

    try {
      const fetched = await ctx.client.callTool({
        name: 'get_tag',
        arguments: { slug: 'seo', includePostCount: true },
      });
      expect(fetched.isError).toBeFalsy();
      expect((fetched.structuredContent as { tag: { post_count: number } }).tag.post_count).toBe(4);

      const created = await ctx.client.callTool({
        name: 'create_tag',
        arguments: { name: '#pillar-seo', visibility: 'internal' },
      });
      expect(created.isError).toBeFalsy();
      expect((created.structuredContent as { tag: { visibility: string } }).tag.visibility).toBe('internal');

      const deleted = await ctx.client.callTool({
        name: 'delete_tag',
        arguments: { id: 'tag-int' },
      });
      expect(deleted.isError).toBeFalsy();
      expect((deleted.structuredContent as { deleted: boolean }).deleted).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('audit_site_readiness detects AdSense/SEO blockers, supports live probes, and honors checkLiveEndpoints=false', async () => {
    const ctx = await connectTestMcp({}, (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/ghost/api/admin/site/') {
        return jsonResponse({
          site: {
            title: 'Test Site',
            description: 'Desc',
            url: 'https://example.ghost.test/',
            logo: null,
            icon: null,
            version: '6.77.0',
          },
        });
      }
      if (url.pathname === '/ghost/api/admin/posts/') {
        return jsonResponse({
          posts: [
            makeSamplePost({
              id: 'p1',
              slug: 'post-1',
              status: 'published',
              meta_title: 'Same Title',
              authors: [{ id: 'a1', name: 'Alice', slug: 'alice', bio: null, profile_image: null }],
            }),
            makeSamplePost({
              id: 'p2',
              slug: 'post-2',
              status: 'published',
              meta_title: 'Same Title',
            }),
          ],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 2, next: null, prev: null } },
        });
      }
      if (url.pathname === '/ghost/api/admin/pages/') {
        return jsonResponse({
          pages: [
            makeSamplePost({
              id: 'pg-privacy',
              title: 'Privacy Policy',
              slug: 'privacy-policy',
              status: 'published',
              html: '<p>We respect your privacy.</p>',
            }),
          ],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 1, next: null, prev: null } },
        });
      }
      if (url.pathname === '/ghost/api/admin/tags/') {
        return jsonResponse({
          tags: [
            {
              id: 't1',
              name: 'Thin Tag',
              slug: 'thin-tag',
              visibility: 'public',
              count: { posts: 1 },
            },
          ],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 1, next: null, prev: null } },
        });
      }
      if (url.pathname === '/robots.txt') {
        return new Response('User-agent: Mediapartners-Google\nDisallow: /\n', { status: 200 });
      }
      if (url.pathname === '/sitemap.xml') {
        return new Response('<urlset></urlset>', { status: 200 });
      }
      if (url.pathname === '/ads.txt') {
        return new Response('Not found', { status: 404 });
      }
      return new Response('Not found', { status: 404 });
    });

    try {
      const withProbes = await ctx.client.callTool({
        name: 'audit_site_readiness',
        arguments: { checkLiveEndpoints: true, timeoutMs: 2000 },
      });
      expect(withProbes.isError).toBeFalsy();
      const report = withProbes.structuredContent as {
        findings: Array<{ code: string; severity: string }>;
        liveEndpointProbes: { checked: boolean; results: Array<{ endpoint: string; ok: boolean }> };
      };
      const codes = report.findings.map((f) => f.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          'INCOMPLETE_PRIVACY_POLICY',
          'MISSING_ABOUT_PAGE',
          'MISSING_CONTACT_PAGE',
          'DUPLICATE_META_TITLE',
          'THIN_PUBLIC_TAGS',
          'INCOMPLETE_AUTHOR_PROFILES',
          'ROBOTS_BLOCKS_GOOGLE',
          'ADS_TXT_MISSING',
        ]),
      );
      expect(report.liveEndpointProbes.checked).toBe(true);

      const probeCountBefore = ctx.requests.filter((r) => r.url.endsWith('/robots.txt')).length;
      const withoutProbes = await ctx.client.callTool({
        name: 'audit_site_readiness',
        arguments: { checkLiveEndpoints: false },
      });
      expect(withoutProbes.isError).toBeFalsy();
      const skippedReport = withoutProbes.structuredContent as {
        liveEndpointProbes: { checked: boolean; results: unknown[] };
      };
      expect(skippedReport.liveEndpointProbes.checked).toBe(false);
      expect(skippedReport.liveEndpointProbes.results).toEqual([]);
      expect(ctx.requests.filter((r) => r.url.endsWith('/robots.txt')).length).toBe(probeCountBefore);
    } finally {
      await ctx.close();
    }
  });
});

describe('audit_site_readiness robots.txt specificity and AbortSignal timeout', () => {
  it('handles multi-agent robots.txt groups, specific Allow overrides, and AbortSignal timeouts', async () => {
    const ctx = await connectTestMcp({}, (req, init) => {
      const url = new URL(req.url);
      if (url.pathname === '/ghost/api/admin/site/') {
        return jsonResponse({
          site: {
            title: 'Test Site',
            description: null,
            url: 'https://example.ghost.test/',
            logo: null,
            icon: null,
            version: '6.77.0',
          },
        });
      }
      if (url.pathname === '/ghost/api/admin/posts/') {
        return jsonResponse({
          posts: [],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 0, next: null, prev: null } },
        });
      }
      if (url.pathname === '/ghost/api/admin/pages/') {
        return jsonResponse({
          pages: [],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 0, next: null, prev: null } },
        });
      }
      if (url.pathname === '/ghost/api/admin/tags/') {
        return jsonResponse({
          tags: [],
          meta: { pagination: { page: 1, limit: 100, pages: 1, total: 0, next: null, prev: null } },
        });
      }
      if (url.pathname === '/robots.txt') {
        // Multi-agent group blocks Mediapartners-Google; specific Googlebot Allow overrides wildcard
        return new Response(
          [
            'User-agent: *',
            'Disallow: /',
            '',
            'User-agent: Googlebot',
            'Allow: /',
            '',
            'User-agent: Mediapartners-Google',
            'User-agent: Bingbot',
            'Disallow: /',
          ].join('\n'),
          { status: 200 },
        );
      }
      if (url.pathname === '/sitemap.xml') {
        // Hang until AbortSignal fires
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new Error('Aborted'));
            return;
          }
          signal?.addEventListener('abort', () => reject(new Error('Probe timed out via AbortSignal')));
        });
      }
      return new Response('Not found', { status: 404 });
    });

    try {
      const res = await ctx.client.callTool({
        name: 'audit_site_readiness',
        arguments: { checkLiveEndpoints: true, timeoutMs: 250 },
      });
      expect(res.isError).toBeFalsy();
      const report = res.structuredContent as {
        findings: Array<{ code: string }>;
        liveEndpointProbes: { results: Array<{ endpoint: string; ok: boolean; note: string }> };
      };
      expect(report.findings.map((f) => f.code)).toContain('ROBOTS_BLOCKS_GOOGLE');
      const sitemapProbe = report.liveEndpointProbes.results.find((p) => p.endpoint === '/sitemap.xml');
      expect(sitemapProbe?.ok).toBe(false);
      expect(sitemapProbe?.note).toMatch(/AbortSignal|timeout|timed out/i);
    } finally {
      await ctx.close();
    }
  });
});
