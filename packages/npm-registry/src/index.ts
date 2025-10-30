#!/usr/bin/env node

import { NPMMCPServer } from "./server.js";

async function main(): Promise<void> {
  try {
    const server = new NPMMCPServer();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start NPM MCP Server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { NPMMCPServer } from "./server.js";
export { NPMClient } from "./npm-client.js";
export { NPMMCPTools } from "./tools.js";
export * from "./types.js";
