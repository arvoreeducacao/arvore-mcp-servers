#!/usr/bin/env node

import { VisualReviewMCPServer } from "./server.js";

try {
  const server = new VisualReviewMCPServer();
  await server.start();
} catch (error) {
  console.error("Failed to start Visual Review MCP Server:", error);
  process.exit(1);
}
