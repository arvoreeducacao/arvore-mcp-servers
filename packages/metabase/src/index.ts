#!/usr/bin/env node

import { MetabaseMCPServer } from "./server.js";

try {
  const server = MetabaseMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Metabase MCP Server:", error);
  process.exit(1);
}

export { MetabaseMCPServer } from "./server.js";
export { MetabaseClient } from "./metabase-client.js";
export { MetabaseMCPTools } from "./tools.js";
export * from "./types.js";
