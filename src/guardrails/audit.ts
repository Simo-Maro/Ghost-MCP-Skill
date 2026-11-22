import type { GhostClient } from '../ghost/client.js';
import type { GhostAuthor, GhostPage, GhostPost, GhostTag } from '../ghost/types.js';

export type AuditSeverity = 'blocker' | 'warning' | 'info';

export interface AuditFinding {
  code: string;
  severity: AuditSeverity;
  message: string;
  count?: number;
  examples?: string[];
}

export interface LiveEndpointProbe {
  endpoint: string;
  status: number | null;
  ok: boolean;
  note: string;
}

export interface ReadinessAuditReport {
  site: {
    title: string;
    url: string;
    version: string;
    https: boolean;
  };
  summary: {
    publishedPosts: number;
    draftPosts: number;
    publishedPages: number;
    publicTags: number;
    blockers: number;
    warnings: number;
    infos: number;
  };
  findings: AuditFinding[];
  liveEndpointProbes: {
    checked: boolean;
    results: LiveEndpointProbe[];
  };
}

export interface AuditOptions {
  checkLiveEndpoints?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const MAX_EXAMPLES = 10;
const DEFAULT_PROBE_TIMEOUT_MS = 5000;

interface RobotsGroup {
  agents: string[];
  allows: string[];
  disallows: string[];
}

export function isRobotsBlockingAgent(robotsTxt: string, userAgent: string): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRuleInGroup = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      if (!current || sawRuleInGroup) {
        current = { agents: [], allows: [], disallows: [] };
        groups.push(current);
        sawRuleInGroup = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (directive === 'disallow' || directive === 'allow')) {
      sawRuleInGroup = true;
      if (directive === 'disallow' && value !== '') {
        current.disallows.push(value);
      } else if (directive === 'allow' && value !== '') {
        current.allows.push(value);
      }
    }
  }

  const target = userAgent.toLowerCase();
  const specificGroups = groups.filter((g) => g.agents.includes(target));
  const applicable =
    specificGroups.length > 0 ? specificGroups : groups.filter((g) => g.agents.includes('*'));

  let rootDisallowed = false;
  let rootAllowed = false;
  for (const group of applicable) {
    if (group.disallows.includes('/')) rootDisallowed = true;
    if (group.allows.includes('/')) rootAllowed = true;
  }

  return rootDisallowed && !rootAllowed;
}

async function probeEndpoint(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ status: number | null; text: string; error?: string }> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'text/plain, application/xml, text/xml, */*' },
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: null, text: '', error: message };
  }
}

export async function runSiteReadinessAudit(
  client: GhostClient,
  options: AuditOptions = {},
): Promise<ReadinessAuditReport> {
  const checkLiveEndpoints = options.checkLiveEndpoints ?? true;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const [site, posts, pages, tags] = await Promise.all([
    client.getSiteInfo(),
    client.fetchAllPages<GhostPost>(async (page) => {
      const res = await client.listPosts({
        page,
        limit: 100,
        include: 'tags,authors',
        formats: 'html',
      });
      return { items: res.posts, pagination: res.pagination };
    }),
    client.fetchAllPages<GhostPage>(async (page) => {
      const res = await client.listPages({
        page,
        limit: 100,
        include: 'tags,authors',
        formats: 'html',
      });
      return { items: res.pages, pagination: res.pagination };
    }),
    client.fetchAllPages<GhostTag>(async (page) => {
      const res = await client.listTags({
        page,
        limit: 100,
        include: 'count.posts',
      });
      return { items: res.tags, pagination: res.pagination };
    }),
  ]);

  const findings: AuditFinding[] = [];
  const publishedPosts = posts.filter((p) => p.status === 'published');
  const draftPosts = posts.filter((p) => p.status === 'draft');
  const publishedPages = pages.filter((p) => p.status === 'published');
  const publicTags = tags.filter((t) => t.visibility === 'public' && !t.name.startsWith('#'));
  const isHttps = site.url.toLowerCase().startsWith('https://');

  // 1. Privacy Policy Page & mandatory Google AdSense disclosures
  const privacyPage = publishedPages.find(
    (p) =>
      p.slug.toLowerCase().includes('privacy') ||
      p.title.toLowerCase().includes('privacy'),
  );
  if (!privacyPage) {
    findings.push({
      code: 'MISSING_PRIVACY_POLICY',
      severity: 'blocker',
      message:
        'No published Privacy Policy Page found. AdSense requires a Privacy Policy disclosing third-party/Google cookie ad serving and user opt-out links.',
    });
  } else {
    const htmlLower = (privacyPage.html ?? '').toLowerCase();
    const hasCookieDisclosure =
      htmlLower.includes('cookie') &&
      (htmlLower.includes('google') || htmlLower.includes('third-party') || htmlLower.includes('third party'));
    const hasOptOut =
      htmlLower.includes('google.com/settings/ads') ||
      htmlLower.includes('adssettings.google.com') ||
      htmlLower.includes('aboutads.info') ||
      htmlLower.includes('google.com/policies/privacy/partners');

    if (!hasCookieDisclosure || !hasOptOut) {
      findings.push({
        code: 'INCOMPLETE_PRIVACY_POLICY',
        severity: 'blocker',
        message:
          'Privacy Policy Page is missing required Google AdSense cookie disclosures or opt-out/partner links (google.com/settings/ads, aboutads.info/choices/, google.com/policies/privacy/partners/).',
        examples: [privacyPage.slug],
      });
    }
  }

  // 2. Trust / E-E-A-T Pages (About & Contact)
  const hasAbout = publishedPages.some(
    (p) => p.slug.toLowerCase().includes('about') || p.title.toLowerCase().includes('about'),
  );
  if (!hasAbout) {
    findings.push({
      code: 'MISSING_ABOUT_PAGE',
      severity: 'warning',
      message:
        'No published About Page found. Add an About Page explaining who runs the Site and your editorial standards (E-E-A-T).',
    });
  }

  const hasContact = publishedPages.some(
    (p) =>
      p.slug.toLowerCase().includes('contact') || p.title.toLowerCase().includes('contact'),
  );
  if (!hasContact) {
    findings.push({
      code: 'MISSING_CONTACT_PAGE',
      severity: 'warning',
      message:
        'No published Contact Page found. Add a Contact Page so readers and reviewers can reach the Site owner.',
    });
  }

  // 3. Duplicate meta_title & meta_description across published Posts & Pages
  const publishedAll = [...publishedPosts, ...publishedPages];
  const metaTitleMap = new Map<string, string[]>();
  const metaDescMap = new Map<string, string[]>();
  const missingMetaDescSlugs: string[] = [];

  for (const item of publishedAll) {
    const mt = item.meta_title?.trim();
    if (mt) {
      const key = mt.toLowerCase();
      metaTitleMap.set(key, [...(metaTitleMap.get(key) ?? []), item.slug]);
    }
    const md = item.meta_description?.trim();
    if (md) {
      const key = md.toLowerCase();
      metaDescMap.set(key, [...(metaDescMap.get(key) ?? []), item.slug]);
    } else {
      missingMetaDescSlugs.push(item.slug);
    }
  }

  const dupTitles = Array.from(metaTitleMap.values()).filter((slugs) => slugs.length > 1);
  if (dupTitles.length > 0) {
    findings.push({
      code: 'DUPLICATE_META_TITLE',
      severity: 'warning',
      message: `Found ${dupTitles.length} duplicate meta_title group(s) across published content.`,
      count: dupTitles.length,
      examples: dupTitles.flat().slice(0, MAX_EXAMPLES),
    });
  }

  const dupDescs = Array.from(metaDescMap.values()).filter((slugs) => slugs.length > 1);
  if (dupDescs.length > 0) {
    findings.push({
      code: 'DUPLICATE_META_DESCRIPTION',
      severity: 'warning',
      message: `Found ${dupDescs.length} duplicate meta_description group(s) across published content.`,
      count: dupDescs.length,
      examples: dupDescs.flat().slice(0, MAX_EXAMPLES),
    });
  }

  if (missingMetaDescSlugs.length > 0) {
    findings.push({
      code: 'PUBLISHED_MISSING_META_DESCRIPTION',
      severity: 'info',
      message: `${missingMetaDescSlugs.length} published Post(s)/Page(s) are missing a custom meta_description.`,
      count: missingMetaDescSlugs.length,
      examples: missingMetaDescSlugs.slice(0, MAX_EXAMPLES),
    });
  }

  // 4. Thin public Tags (<= 1 post)
  const thinTags = publicTags.filter((t) => (t.count?.posts ?? 0) <= 1);
  if (thinTags.length > 0) {
    findings.push({
      code: 'THIN_PUBLIC_TAGS',
      severity: 'warning',
      message: `Found ${thinTags.length} public Tag(s) with 0-1 Posts. Consolidate thin public Tags or convert them to #internal Tags to avoid thin archive pages.`,
      count: thinTags.length,
      examples: thinTags.map((t) => t.slug).slice(0, MAX_EXAMPLES),
    });
  }

  // 5. Author E-E-A-T profile completeness via Posts include=authors
  const authorMap = new Map<string, GhostAuthor>();
  for (const post of publishedPosts) {
    for (const author of post.authors ?? []) {
      authorMap.set(author.id, author);
    }
    if (post.primary_author) {
      authorMap.set(post.primary_author.id, post.primary_author);
    }
  }
  const incompleteAuthors = Array.from(authorMap.values()).filter(
    (a) => !a.bio?.trim() || !a.profile_image?.trim(),
  );
  if (incompleteAuthors.length > 0) {
    findings.push({
      code: 'INCOMPLETE_AUTHOR_PROFILES',
      severity: 'warning',
      message: `${incompleteAuthors.length} published author(s) are missing a bio or profile image (strengthens E-E-A-T).`,
      count: incompleteAuthors.length,
      examples: incompleteAuthors.map((a) => a.slug || a.name).slice(0, MAX_EXAMPLES),
    });
  }

  // 6. Optional live public HTTP probes (HTTPS, /robots.txt, /sitemap.xml, /ads.txt)
  const probeResults: LiveEndpointProbe[] = [];
  if (checkLiveEndpoints) {
    if (!isHttps) {
      findings.push({
        code: 'SITE_NOT_HTTPS',
        severity: 'blocker',
        message: `Site URL "${site.url}" does not use HTTPS. Serve your public Site over HTTPS for Search and AdSense.`,
      });
    }

    const [robots, sitemap, adsTxt] = await Promise.all([
      probeEndpoint(site.url, '/robots.txt', timeoutMs, fetchImpl),
      probeEndpoint(site.url, '/sitemap.xml', timeoutMs, fetchImpl),
      probeEndpoint(site.url, '/ads.txt', timeoutMs, fetchImpl),
    ]);

    if (robots.error) {
      probeResults.push({
        endpoint: '/robots.txt',
        status: null,
        ok: false,
        note: `Probe failed: ${robots.error}`,
      });
      findings.push({
        code: 'ROBOTS_TXT_UNREACHABLE',
        severity: 'warning',
        message: `Could not fetch /robots.txt (${robots.error}).`,
      });
    } else if (robots.status !== 200) {
      probeResults.push({
        endpoint: '/robots.txt',
        status: robots.status,
        ok: false,
        note: `HTTP ${robots.status}`,
      });
      findings.push({
        code: 'ROBOTS_TXT_MISSING',
        severity: 'warning',
        message: `/robots.txt returned HTTP ${robots.status}.`,
      });
    } else {
      const blocksGooglebot = isRobotsBlockingAgent(robots.text, 'Googlebot');
      const blocksMediapartners = isRobotsBlockingAgent(robots.text, 'Mediapartners-Google');
      const ok = !blocksGooglebot && !blocksMediapartners;
      probeResults.push({
        endpoint: '/robots.txt',
        status: 200,
        ok,
        note: ok
          ? 'Reachable; Googlebot and Mediapartners-Google allowed.'
          : 'Disallows Googlebot or Mediapartners-Google!',
      });
      if (!ok) {
        findings.push({
          code: 'ROBOTS_BLOCKS_GOOGLE',
          severity: 'blocker',
          message:
            '/robots.txt disallows Googlebot or Mediapartners-Google. Unblock Google crawlers for indexing and AdSense.',
        });
      }
    }

    if (sitemap.error || sitemap.status !== 200) {
      const detail = sitemap.error ?? `HTTP ${sitemap.status}`;
      probeResults.push({
        endpoint: '/sitemap.xml',
        status: sitemap.status,
        ok: false,
        note: `Unavailable (${detail})`,
      });
      findings.push({
        code: 'SITEMAP_UNAVAILABLE',
        severity: 'warning',
        message: `/sitemap.xml is not reachable (${detail}).`,
      });
    } else {
      probeResults.push({
        endpoint: '/sitemap.xml',
        status: 200,
        ok: true,
        note: 'Reachable.',
      });
    }

    if (adsTxt.error || adsTxt.status !== 200) {
      const detail = adsTxt.error ?? `HTTP ${adsTxt.status}`;
      probeResults.push({
        endpoint: '/ads.txt',
        status: adsTxt.status,
        ok: false,
        note: `Not found (${detail})`,
      });
      findings.push({
        code: 'ADS_TXT_MISSING',
        severity: 'info',
        message:
          '/ads.txt is not currently served. After AdSense approval, place ads.txt in your active Ghost theme root or serve it via your reverse proxy/CDN.',
      });
    } else {
      probeResults.push({
        endpoint: '/ads.txt',
        status: 200,
        ok: true,
        note: 'Reachable.',
      });
    }
  }

  return {
    site: {
      title: site.title,
      url: site.url,
      version: site.version,
      https: isHttps,
    },
    summary: {
      publishedPosts: publishedPosts.length,
      draftPosts: draftPosts.length,
      publishedPages: publishedPages.length,
      publicTags: publicTags.length,
      blockers: findings.filter((f) => f.severity === 'blocker').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      infos: findings.filter((f) => f.severity === 'info').length,
    },
    findings,
    liveEndpointProbes: {
      checked: checkLiveEndpoints,
      results: probeResults,
    },
  };
}
