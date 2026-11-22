import { createHmac } from 'node:crypto';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer, type ServerDependencies } from '../../src/server.js';
import type { ServerConfig } from '../../src/config.js';

export const TEST_KEY_ID = '0123456789abcdef01234567';
export const TEST_KEY_SECRET =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export const TEST_API_KEY = `${TEST_KEY_ID}:${TEST_KEY_SECRET}`;
export const TEST_GHOST_URL = 'https://example.ghost.test';

export function makeTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ghostUrl: TEST_GHOST_URL,
    adminApiKey: TEST_API_KEY,
    readOnly: false,
    draftOnly: false,
    allowInsecureHttp: false,
    ...overrides,
  };
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: RequestInit['body'];
}

export type MockFetchHandler = (
  req: RecordedRequest,
  init?: RequestInit,
) => Promise<Response> | Response;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function verifyGhostJwt(authHeader: string | null, apiKey = TEST_API_KEY): void {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }
  const match = /^Ghost\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authHeader);
  if (!match) {
    throw new Error(`Invalid Ghost Authorization header format: ${authHeader}`);
  }
  const [, headerB64, payloadB64, signatureB64] = match;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Malformed JWT segments');
  }

  const [expectedId, expectedSecret] = apiKey.split(':');
  if (!expectedId || !expectedSecret) {
    throw new Error('Invalid test API key');
  }

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    typ?: string;
    kid?: string;
  };
  if (header.alg !== 'HS256' || header.typ !== 'JWT' || header.kid !== expectedId) {
    throw new Error(`Unexpected JWT header: ${JSON.stringify(header)}`);
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    iat?: number;
    exp?: number;
    aud?: string;
  };
  if (payload.aud !== '/admin/') {
    throw new Error(`Unexpected JWT aud: ${String(payload.aud)}`);
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('JWT missing iat or exp');
  }
  if (payload.exp <= payload.iat || payload.exp - payload.iat > 300) {
    throw new Error(`JWT expiry window out of bounds: exp-iat=${payload.exp - payload.iat}`);
  }

  const expectedSig = createHmac('sha256', Buffer.from(expectedSecret, 'hex'))
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signatureB64 !== expectedSig) {
    throw new Error('JWT HS256 signature mismatch');
  }
}

export async function connectTestMcp(
  configOverrides: Partial<ServerConfig> = {},
  handler?: MockFetchHandler,
  extraDeps: Omit<ServerDependencies, 'fetch'> = {},
) {
  const requests: RecordedRequest[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const recorded: RecordedRequest = {
      url,
      method: method.toUpperCase(),
      headers,
      body: init?.body,
    };
    requests.push(recorded);
    if (!handler) {
      return jsonResponse({ errors: [{ message: `Unhandled request: ${method} ${url}` }] }, 500);
    }
    return handler(recorded, init);
  };

  const server = createServer(makeTestConfig(configOverrides), {
    fetch: mockFetch,
    ...extraDeps,
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    server,
    requests,
    async close() {
      await client.close();
      await server.close();
    },
  };
}
