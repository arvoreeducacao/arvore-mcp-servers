#!/usr/bin/env node

import { MySQLMCPServer } from "./server.js";
import { fileURLToPath } from "node:url";

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  console.error("[DEBUG] Script started as main module");
  console.error("[DEBUG] process.argv:", process.argv);
  console.error("[DEBUG] import.meta.url:", import.meta.url);
  try {
    console.error("[DEBUG] Creating server from environment...");
    const server = MySQLMCPServer.fromEnvironment();
    console.error("[DEBUG] Setting up graceful shutdown...");
    server.setupGracefulShutdown();
    console.error("[DEBUG] Starting server...");
    await server.start();
    console.error("[DEBUG] Server start completed");
  } catch (error) {
    console.error("Failed to start MySQL MCP Server:", error);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
} else {
  console.error("[DEBUG] Script NOT running as main module");
  console.error("[DEBUG] process.argv[1]:", process.argv[1]);
  console.error("[DEBUG] import.meta.url:", import.meta.url);
  console.error(
    "[DEBUG] fileURLToPath result:",
    fileURLToPath(import.meta.url)
  );
}

export { MySQLMCPServer } from "./server.js";
export { MySQLConnection } from "./database.js";
export { MySQLMCPTools } from "./tools.js";
export * from "./types.js";
