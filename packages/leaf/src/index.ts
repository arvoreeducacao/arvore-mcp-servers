#!/usr/bin/env node

import { LeafMCPServer } from "./server.js";

try {
  const server = LeafMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Leaf MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { LeafMCPServer } from "./server.js";
export { LeafConnection } from "./database.js";
export { LeafMCPTools } from "./tools.js";
export * from "./types.js";
