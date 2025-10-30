#!/usr/bin/env node

import { MySQLMCPServer } from "./server.js";
import { fileURLToPath } from "node:url";

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  try {
    const server = MySQLMCPServer.fromEnvironment();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start MySQL MCP Server:", error);
    process.exit(1);
  }
}

export { MySQLMCPServer } from "./server.js";
export { MySQLConnection } from "./database.js";
export { MySQLMCPTools } from "./tools.js";
export * from "./types.js";
