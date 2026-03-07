#!/usr/bin/env node

import { ClickHouseMCPServer } from "./server.js";

try {
  const server = ClickHouseMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start ClickHouse MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { ClickHouseMCPServer } from "./server.js";
export { ClickHouseConnection } from "./database.js";
export { ClickHouseMCPTools } from "./tools.js";
export * from "./types.js";
