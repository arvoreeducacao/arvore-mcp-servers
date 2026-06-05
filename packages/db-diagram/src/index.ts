#!/usr/bin/env node

import { DbDiagramMCPServer } from "./server.js";

try {
  const server = new DbDiagramMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start DB Diagram MCP Server:", error);
  process.exit(1);
}

export { DbDiagramMCPServer } from "./server.js";
export { parseDDL, extractInlineForeignKeys } from "./parser.js";
export {
  generateErd,
  generateDomainMap,
  explainTable,
  traceFlow,
} from "./mermaid.js";
export { visualize } from "./visualizer.js";
export * from "./types.js";
