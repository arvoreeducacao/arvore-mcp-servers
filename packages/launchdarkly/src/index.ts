#!/usr/bin/env node

import { LaunchDarklyMCPServer } from "./server.js";

try {
  const server = LaunchDarklyMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start LaunchDarkly MCP Server:", error);
  process.exit(1);
}

export { LaunchDarklyMCPServer } from "./server.js";
export { LaunchDarklyClient } from "./launchdarkly-client.js";
export { LaunchDarklyMCPTools } from "./tools.js";
export * from "./types.js";
