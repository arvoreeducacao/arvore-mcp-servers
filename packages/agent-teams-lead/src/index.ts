#!/usr/bin/env node

import { resolve } from "node:path";
import { LeadMCPServer } from "./server.js";

const workspacePath = resolve(process.env.WORKSPACE_PATH || process.cwd());

try {
  const server = new LeadMCPServer(workspacePath);
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Agent Teams Lead MCP Server:", error);
  process.exit(1);
}

export { LeadMCPServer } from "./server.js";
export { TeamStore } from "./store.js";
export { LeadTools } from "./tools.js";
export * from "./types.js";
export * from "./schemas.js";
