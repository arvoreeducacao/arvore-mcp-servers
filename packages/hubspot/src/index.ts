#!/usr/bin/env node

import { HubSpotMCPServer } from "./server.js";

try {
  const server = new HubSpotMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start HubSpot MCP Server:", error);
  process.exit(1);
}

export { HubSpotMCPServer } from "./server.js";
export { HubSpotClient } from "./hubspot-client.js";
export { HubSpotMCPTools } from "./tools.js";
export * from "./types.js";
