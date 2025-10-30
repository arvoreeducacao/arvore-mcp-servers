#!/usr/bin/env node

import { NPMMCPServer } from "./server.js";

try {
  const server = new NPMMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start NPM MCP Server:", error);
  process.exit(1);
}

export { NPMMCPServer } from "./server.js";
export { NPMClient } from "./npm-client.js";
export { NPMMCPTools } from "./tools.js";
export * from "./types.js";
