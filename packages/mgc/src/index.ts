#!/usr/bin/env node

import { MgcMCPServer } from "./server.js";

try {
  const server = new MgcMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start MGC MCP Server:", error);
  process.exit(1);
}

export { MgcMCPServer } from "./server.js";
export { MgcClient } from "./mgc-client.js";
export { MgcTools } from "./tools.js";
export * from "./types.js";
