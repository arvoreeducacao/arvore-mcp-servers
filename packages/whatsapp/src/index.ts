#!/usr/bin/env node

import { WhatsAppMcpServer } from "./server.js";

try {
  const server = new WhatsAppMcpServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  process.stderr.write(`[whatsapp-mcp] failed to start: ${error}\n`);
  process.exit(1);
}

export { WhatsAppMcpServer } from "./server.js";
export { WhatsAppClient } from "./whatsapp-client.js";
