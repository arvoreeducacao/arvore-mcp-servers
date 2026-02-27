#!/usr/bin/env node

import { RuntimeLensMCPServer } from "./server.js";

try {
  const server = RuntimeLensMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Runtime Lens MCP Server:", error);
  process.exit(1);
}

export { RuntimeLensMCPServer } from "./server.js";
export { LogCollector } from "./log-collector.js";
export { ProcessInspector } from "./process-inspector.js";
export { RuntimeInterceptor } from "./runtime-interceptor.js";
export * from "./types.js";
