#!/usr/bin/env node

import { NPMMCPServer } from "./server.js";
import { fileURLToPath } from "node:url";

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  try {
    const server = new NPMMCPServer();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start NPM MCP Server:", error);
    process.exit(1);
  }
}

export { NPMMCPServer } from "./server.js";
export { NPMClient } from "./npm-client.js";
export { NPMMCPTools } from "./tools.js";
export * from "./types.js";
