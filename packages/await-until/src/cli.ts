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
