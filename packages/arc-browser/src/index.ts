#!/usr/bin/env node

import { ArcBrowserMCPServer } from "./server.js";

try {
  const server = new ArcBrowserMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Arc Browser MCP Server:", error);
  process.exit(1);
}
