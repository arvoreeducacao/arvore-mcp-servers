#!/usr/bin/env node

import { MySQLMCPServer } from "./server.js";

async function main(): Promise<void> {
  try {
    const server = MySQLMCPServer.fromEnvironment();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start MySQL MCP Server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { MySQLMCPServer } from "./server.js";
export { MySQLConnection } from "./database.js";
export { MySQLMCPTools } from "./tools.js";
export * from "./types.js";
