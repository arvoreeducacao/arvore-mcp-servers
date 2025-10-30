#!/usr/bin/env node

import { DatadogMCPServer } from "./server.js";
import { fileURLToPath } from "node:url";

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  try {
    const server = DatadogMCPServer.fromEnvironment();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start Datadog MCP Server:", error);
    process.exit(1);
  }
}

export { DatadogMCPServer } from "./server.js";
export { DatadogClient } from "./datadog-client.js";
export { DatadogMCPTools } from "./tools.js";
export * from "./types.js";
