#!/usr/bin/env node

import { DatadogMCPServer } from "./server.js";

async function main(): Promise<void> {
  try {
    const server = DatadogMCPServer.fromEnvironment();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start Datadog MCP Server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { DatadogMCPServer } from "./server.js";
export { DatadogClient } from "./datadog-client.js";
export { DatadogMCPTools } from "./tools.js";
export * from "./types.js";
