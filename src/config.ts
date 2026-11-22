import { resolve } from 'node:path';

export interface ServerConfig {
  ghostUrl: string;
  adminApiKey: string;
  uploadRoot?: string;
  readOnly: boolean;
  draftOnly: boolean;
  allowInsecureHttp: boolean;
}

export interface ParseConfigOptions {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
}

const ADMIN_KEY_PATTERN = /^[0-9a-fA-F]{24}:[0-9a-fA-F]{64}$/;
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseConfig(options: ParseConfigOptions = {}): ServerConfig {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);

  let readOnly = false;
  let draftOnly = false;
  let allowInsecureHttp = false;

  for (const arg of argv) {
    if (arg === '--read-only') {
      readOnly = true;
    } else if (arg === '--draft-only') {
      draftOnly = true;
    } else if (arg === '--allow-insecure-http') {
      allowInsecureHttp = true;
    } else if (arg.startsWith('--')) {
      throw new ConfigError(
        `Unknown flag "${arg}". Supported flags: --read-only, --draft-only, --allow-insecure-http`,
      );
    }
  }

  const rawUrl = env.GHOST_URL?.trim();
  if (!rawUrl) {
    throw new ConfigError(
      'Missing GHOST_URL environment variable. Set GHOST_URL to your Ghost Site origin (e.g. https://your-site.example).',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new ConfigError(
      `Invalid GHOST_URL "${rawUrl}". Provide a valid URL such as https://your-site.example or http://localhost:2368.`,
    );
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new ConfigError(
      `Unsupported GHOST_URL protocol "${parsedUrl.protocol}". Use https:// (or http://localhost / http://127.0.0.1 for local development).`,
    );
  }

  if (parsedUrl.protocol === 'http:') {
    const isLocalHost = LOCAL_HTTP_HOSTS.has(parsedUrl.hostname.toLowerCase());
    if (!isLocalHost && !allowInsecureHttp) {
      throw new ConfigError(
        `Insecure http:// GHOST_URL "${parsedUrl.origin}" is blocked for non-local hosts to protect your Ghost Admin API key. Use https://, or pass --allow-insecure-http explicitly for private LAN/Tailscale Sites.`,
      );
    }
  }

  const normalizedUrl = parsedUrl.toString().replace(/\/+$/, '');

  const rawKey = env.GHOST_ADMIN_API_KEY?.trim();
  if (!rawKey) {
    throw new ConfigError(
      'Missing GHOST_ADMIN_API_KEY environment variable. Create a Custom Integration in Ghost Admin (Settings → Integrations) and copy its Admin API Key (format: <24-hex-id>:<64-hex-secret>).',
    );
  }

  if (!ADMIN_KEY_PATTERN.test(rawKey)) {
    throw new ConfigError(
      'Invalid GHOST_ADMIN_API_KEY format. Expected "<24-hex-id>:<64-hex-secret>" from a Ghost Custom Integration (never the Content API Key).',
    );
  }

  const rawUploadRoot = env.GHOST_UPLOAD_ROOT?.trim();
  const uploadRoot = rawUploadRoot ? resolve(rawUploadRoot) : undefined;

  return {
    ghostUrl: normalizedUrl,
    adminApiKey: rawKey,
    uploadRoot,
    readOnly,
    draftOnly,
    allowInsecureHttp,
  };
}
