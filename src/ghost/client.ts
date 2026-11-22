import { createGhostJwt } from './jwt.js';
import type {
  GhostImageUploadResult,
  GhostPage,
  GhostPagination,
  GhostPost,
  GhostSite,
  GhostTag,
} from './types.js';

export const GHOST_API_VERSION = 'v6.0';
export const GHOST_MAX_PAGE_LIMIT = 100;

export class GhostApiError extends Error {
  readonly status: number;
  readonly errorType?: string;
  readonly context?: string | null;

  constructor(message: string, status: number, errorType?: string, context?: string | null) {
    super(message);
    this.name = 'GhostApiError';
    this.status = status;
    this.errorType = errorType;
    this.context = context;
  }
}

export interface GhostClientOptions {
  ghostUrl: string;
  adminApiKey: string;
  fetch?: typeof fetch;
}

export interface ListQueryOptions {
  page?: number;
  limit?: number;
  filter?: string;
  order?: string;
  include?: string;
  formats?: string;
}

export type EntityLookup = { id: string; slug?: undefined } | { slug: string; id?: undefined };

export class GhostClient {
  private readonly baseUrl: string;
  private readonly adminApiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GhostClientOptions) {
    this.baseUrl = `${options.ghostUrl.replace(/\/+$/, '')}/ghost/api/admin`;
    this.adminApiKey = options.adminApiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      query?: Record<string, string | number | undefined>;
      json?: unknown;
      formData?: FormData;
    } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const headers: Record<string, string> = {
      Authorization: `Ghost ${createGhostJwt(this.adminApiKey)}`,
      'Accept-Version': GHOST_API_VERSION,
      Accept: 'application/json',
    };

    let body: RequestInit['body'];
    if (options.formData !== undefined) {
      body = options.formData;
    } else if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    }

    const response = await this.fetchImpl(url, { method, headers, body });
    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const parsed = contentType.includes('application/json')
      ? ((await response.json()) as unknown)
      : await response.text();

    if (!response.ok) {
      let message = `Ghost Admin API request failed (${response.status} ${response.statusText})`;
      let errorType: string | undefined;
      let context: string | null | undefined;
      if (parsed && typeof parsed === 'object' && 'errors' in parsed) {
        const first = (
          parsed as { errors?: Array<{ message?: string; context?: string | null; type?: string }> }
        ).errors?.[0];
        if (first) {
          errorType = first.type;
          context = first.context;
          message = first.context
            ? `${first.message ?? message}: ${first.context}`
            : (first.message ?? message);
        }
      } else if (typeof parsed === 'string' && parsed.trim()) {
        message = `${message}: ${parsed.slice(0, 300)}`;
      }
      throw new GhostApiError(message, response.status, errorType, context);
    }

    return parsed as T;
  }

  private async listCollection<T, K extends string>(
    resource: K,
    options: ListQueryOptions,
    defaultLimit: number,
    defaultInclude?: string,
  ): Promise<{ items: T[]; pagination: GhostPagination }> {
    const limit = Math.min(Math.max(options.limit ?? defaultLimit, 1), GHOST_MAX_PAGE_LIMIT);
    const data = await this.request<Record<K, T[]> & { meta: { pagination: GhostPagination } }>(
      'GET',
      `/${resource}/`,
      {
        query: {
          page: options.page ?? 1,
          limit,
          filter: options.filter,
          order: options.order,
          include: options.include ?? defaultInclude,
          formats: options.formats,
        },
      },
    );
    return { items: data[resource], pagination: data.meta.pagination };
  }

  private async getEntity<T, K extends string>(
    resource: K,
    lookup: { id?: string; slug?: string },
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const path = lookup.slug
      ? `/${resource}/slug/${encodeURIComponent(lookup.slug)}/`
      : `/${resource}/${encodeURIComponent(lookup.id ?? '')}/`;
    const data = await this.request<Record<K, T[]>>('GET', path, { query });
    const item = data[resource][0];
    if (!item) {
      throw new GhostApiError(`${resource} item not found`, 404, 'NotFoundError');
    }
    return item;
  }

  private async writeEntity<T, K extends string>(
    method: 'POST' | 'PUT',
    resource: K,
    path: string,
    payload: Record<string, unknown>,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const data = await this.request<Record<K, T[]>>(method, path, {
      query,
      json: { [resource]: [payload] },
    });
    const item = data[resource][0];
    if (!item) {
      throw new GhostApiError(`Ghost did not return the ${resource} item`, 500);
    }
    return item;
  }

  async getSiteInfo(): Promise<GhostSite> {
    return (await this.request<{ site: GhostSite }>('GET', '/site/')).site;
  }

  async listPosts(options: ListQueryOptions = {}) {
    const { items, pagination } = await this.listCollection<GhostPost, 'posts'>(
      'posts',
      options,
      15,
      'tags,authors',
    );
    return { posts: items, pagination };
  }

  async getPost(lookup: { id?: string; slug?: string }, formats?: string): Promise<GhostPost> {
    return this.getEntity<GhostPost, 'posts'>('posts', lookup, {
      include: 'tags,authors',
      formats,
    });
  }

  async createPost(payload: Record<string, unknown>, sourceHtml: boolean): Promise<GhostPost> {
    return this.writeEntity<GhostPost, 'posts'>('POST', 'posts', '/posts/', payload, {
      include: 'tags,authors',
      formats: 'html,lexical',
      ...(sourceHtml ? { source: 'html' } : {}),
    });
  }

  async updatePost(
    id: string,
    payload: Record<string, unknown>,
    sourceHtml: boolean,
  ): Promise<GhostPost> {
    return this.writeEntity<GhostPost, 'posts'>(
      'PUT',
      'posts',
      `/posts/${encodeURIComponent(id)}/`,
      payload,
      {
        include: 'tags,authors',
        formats: 'html,lexical',
        ...(sourceHtml ? { source: 'html' } : {}),
      },
    );
  }

  async deletePost(id: string): Promise<void> {
    await this.request<void>('DELETE', `/posts/${encodeURIComponent(id)}/`);
  }

  async listPages(options: ListQueryOptions = {}) {
    const { items, pagination } = await this.listCollection<GhostPage, 'pages'>(
      'pages',
      options,
      15,
      'tags,authors',
    );
    return { pages: items, pagination };
  }

  async getPage(lookup: { id?: string; slug?: string }, formats?: string): Promise<GhostPage> {
    return this.getEntity<GhostPage, 'pages'>('pages', lookup, {
      include: 'tags,authors',
      formats,
    });
  }

  async createPage(payload: Record<string, unknown>, sourceHtml: boolean): Promise<GhostPage> {
    return this.writeEntity<GhostPage, 'pages'>('POST', 'pages', '/pages/', payload, {
      include: 'tags,authors',
      formats: 'html,lexical',
      ...(sourceHtml ? { source: 'html' } : {}),
    });
  }

  async updatePage(
    id: string,
    payload: Record<string, unknown>,
    sourceHtml: boolean,
  ): Promise<GhostPage> {
    return this.writeEntity<GhostPage, 'pages'>(
      'PUT',
      'pages',
      `/pages/${encodeURIComponent(id)}/`,
      payload,
      {
        include: 'tags,authors',
        formats: 'html,lexical',
        ...(sourceHtml ? { source: 'html' } : {}),
      },
    );
  }

  async deletePage(id: string): Promise<void> {
    await this.request<void>('DELETE', `/pages/${encodeURIComponent(id)}/`);
  }

  async listTags(options: ListQueryOptions = {}) {
    const { items, pagination } = await this.listCollection<GhostTag, 'tags'>('tags', options, 50);
    return { tags: items, pagination };
  }

  async getTag(lookup: { id?: string; slug?: string }, includeCount = false): Promise<GhostTag> {
    return this.getEntity<GhostTag, 'tags'>('tags', lookup, {
      include: includeCount ? 'count.posts' : undefined,
    });
  }

  async createTag(payload: Record<string, unknown>): Promise<GhostTag> {
    return this.writeEntity<GhostTag, 'tags'>('POST', 'tags', '/tags/', payload);
  }

  async updateTag(id: string, payload: Record<string, unknown>): Promise<GhostTag> {
    return this.writeEntity<GhostTag, 'tags'>(
      'PUT',
      'tags',
      `/tags/${encodeURIComponent(id)}/`,
      payload,
    );
  }

  async deleteTag(id: string): Promise<void> {
    await this.request<void>('DELETE', `/tags/${encodeURIComponent(id)}/`);
  }

  async uploadImage(params: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    purpose: 'image' | 'profile_image' | 'icon';
    ref?: string;
  }): Promise<GhostImageUploadResult> {
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
      params.filename,
    );
    formData.append('purpose', params.purpose);
    if (params.ref) {
      formData.append('ref', params.ref);
    }

    const data = await this.request<{ images: GhostImageUploadResult[] }>(
      'POST',
      '/images/upload/',
      { formData },
    );
    const uploaded = data.images[0];
    if (!uploaded) {
      throw new GhostApiError('Ghost did not return an uploaded image URL', 500);
    }
    return uploaded;
  }

  async fetchAllPages<T>(
    fetcher: (page: number) => Promise<{ items: T[]; pagination: GhostPagination }>,
    maxPages = 50,
  ): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    while (page <= maxPages) {
      const { items, pagination } = await fetcher(page);
      all.push(...items);
      if (!pagination.next || page >= pagination.pages) {
        break;
      }
      page = pagination.next;
    }
    return all;
  }
}
