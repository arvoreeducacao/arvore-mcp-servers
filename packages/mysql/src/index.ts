#!/usr/bin/env node

import { MySQLMCPServer } from "./server.js";

try {
  const server = MySQLMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start MySQL MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { MySQLMCPServer } from "./server.js";
export { MySQLConnection } from "./database.js";
export { MySQLMCPTools } from "./tools.js";
export * from "./types.js";
