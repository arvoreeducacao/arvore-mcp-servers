#!/usr/bin/env node

import { PostgreSQLMCPServer } from "./server.js";

try {
  const server = PostgreSQLMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start PostgreSQL MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { PostgreSQLMCPServer } from "./server.js";
export { PostgreSQLConnection } from "./database.js";
export { PostgreSQLMCPTools } from "./tools.js";
export * from "./types.js";
