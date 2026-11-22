import { McpServer } from '@modelcontextprotocol/server';
import type { ServerConfig } from './config.js';
import { GhostClient } from './ghost/client.js';
import type { SharpLoader } from './media/upload.js';
import { registerMediaTools } from './tools/media.js';
import { registerPageTools } from './tools/pages.js';
import { registerPostTools } from './tools/posts.js';
import { registerSiteTools } from './tools/site.js';
import { registerTagTools } from './tools/tags.js';

export const SERVER_NAME = 'ghost-cms-mcp';
export const SERVER_VERSION = '0.1.0';

export interface ServerDependencies {
  fetch?: typeof fetch;
  loadSharp?: SharpLoader;
}

export function createServer(
  config: ServerConfig,
  deps: ServerDependencies = {},
): McpServer {
  const client = new GhostClient({
    ghostUrl: config.ghostUrl,
    adminApiKey: config.adminApiKey,
    fetch: deps.fetch,
  });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Deterministic registration order across all 18 tools:
  // Site (2) -> Posts (5) -> Pages (5) -> Tags (5) -> Media (1)
  registerSiteTools(server, client, deps.fetch);
  registerPostTools(server, client, config);
  registerPageTools(server, client, config);
  registerTagTools(server, client, config);
  registerMediaTools(server, client, config, deps.loadSharp);

  return server;
}
