import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { parseConfig } from './config.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  const config = parseConfig();
  const modeLabel = config.readOnly
    ? 'read-only'
    : config.draftOnly
      ? 'draft-only'
      : 'full';

  process.stderr.write(
    `[${SERVER_NAME} v${SERVER_VERSION}] Connected to ${config.ghostUrl} (mode: ${modeLabel})\n`,
  );

  await serveStdio(() => createServer(config));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[${SERVER_NAME}] Fatal startup error: ${message}\n`);
  process.exit(1);
});
