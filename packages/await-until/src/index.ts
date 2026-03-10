#!/usr/bin/env node

import { AwaitUntilMCPServer } from "./server.js";

try {
  const server = new AwaitUntilMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Await-Until MCP Server:", error);
  process.exit(1);
}

export { AwaitUntilMCPServer } from "./server.js";
export * from "./types.js";
export { pollCommand, pollUrl, pollFile, pollMcp } from "./pollers.js";
export { findMcpConfig, getServerConfig, callMcpTool } from "./mcp-client.js";
