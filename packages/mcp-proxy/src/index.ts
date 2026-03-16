#!/usr/bin/env node

import { McpProxyServer } from "./server.js";

try {
  const server = McpProxyServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start MCP Proxy Gateway:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { McpProxyServer } from "./server.js";
export { ToolRegistry } from "./registry.js";
export { McpConnectorManager } from "./connector.js";
export { HybridSearch } from "./search.js";
export { EmbeddingEngine } from "./embeddings.js";
export { OutputShaper } from "./output-shaper.js";
export { PaginationManager } from "./pagination.js";
export { AuditLogger } from "./logger.js";
export { Dashboard } from "./dashboard.js";
export * from "./types.js";
