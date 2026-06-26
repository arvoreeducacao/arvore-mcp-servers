#!/usr/bin/env node

import { ClientHubMCPServer } from "./server.js";

try {
  const server = ClientHubMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Client Hub MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { ClientHubMCPServer } from "./server.js";
export { ClientHubApiClient } from "./api-client.js";
export { ClientHubMCPTools } from "./tools.js";
export * from "./types.js";
