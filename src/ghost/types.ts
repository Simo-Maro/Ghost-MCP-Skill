export interface GhostPagination {
  page: number;
  limit: number;
  pages: number;
  total: number;
  next: number | null;
  prev: number | null;
}

export interface GhostSite {
  title: string;
  description: string | null;
  url: string;
  logo: string | null;
  icon: string | null;
  version: string;
}

export interface GhostAuthor {
  id: string;
  name: string;
  slug: string;
  bio?: string | null;
  profile_image?: string | null;
  website?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface GhostTag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  feature_image: string | null;
  visibility: 'public' | 'internal';
  og_image: string | null;
  og_title: string | null;
  og_description: string | null;
  twitter_image: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  codeinjection_head: string | null;
  codeinjection_foot: string | null;
  canonical_url: string | null;
  accent_color: string | null;
  url?: string;
  count?: { posts: number };
  created_at?: string;
  updated_at?: string;
}

export interface GhostContentBase {
  id: string;
  uuid?: string;
  title: string;
  slug: string;
  html?: string | null;
  lexical?: string | null;
  feature_image: string | null;
  feature_image_alt: string | null;
  feature_image_caption: string | null;
  featured: boolean;
  status: 'draft' | 'published' | 'scheduled';
  visibility: 'public' | 'members' | 'paid' | 'tiers';
  created_at: string;
  updated_at: string;
  published_at: string | null;
  custom_excerpt: string | null;
  codeinjection_head: string | null;
  codeinjection_foot: string | null;
  custom_template: string | null;
  canonical_url: string | null;
  url?: string;
  excerpt?: string;
  reading_time?: number;
  og_image: string | null;
  og_title: string | null;
  og_description: string | null;
  twitter_image: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  tags?: Array<Pick<GhostTag, 'id' | 'name' | 'slug' | 'visibility'>>;
  authors?: GhostAuthor[];
  primary_author?: GhostAuthor | null;
  primary_tag?: Pick<GhostTag, 'id' | 'name' | 'slug' | 'visibility'> | null;
}

export type GhostPost = GhostContentBase;

export interface GhostPage extends GhostContentBase {
  show_title_and_feature_image?: boolean;
}

export interface GhostImageUploadResult {
  url: string;
  ref: string | null;
}
