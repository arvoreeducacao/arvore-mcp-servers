#!/usr/bin/env node

import { GupyMCPServer } from "./server.js";

try {
  const server = new GupyMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Gupy MCP Server:", error);
  process.exit(1);
}

export { GupyMCPServer } from "./server.js";
export { GupyClient } from "./gupy-client.js";
export { GupyMCPTools } from "./tools.js";
export * from "./types.js";
