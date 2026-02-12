#!/usr/bin/env node

import { TempMailMCPServer } from "./server.js";

try {
  const server = new TempMailMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start TempMail MCP Server:", error);
  process.exit(1);
}

export { TempMailMCPServer } from "./server.js";
export { D1DatabaseClient } from "./d1-client.js";
export { TempMailMCPTools } from "./tools.js";
export * from "./types.js";
