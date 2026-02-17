#!/usr/bin/env node

import { resolve } from "node:path";
import { MemoryMCPServer } from "./server.js";

const memoriesPath = resolve(
  process.env.MEMORY_PATH || process.cwd(),
  process.env.MEMORY_PATH ? "" : "memories"
);
const embeddingModel = process.env.MEMORY_EMBEDDING_MODEL;

try {
  const server = new MemoryMCPServer(memoriesPath, embeddingModel);
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Memory MCP Server:", error);
  process.exit(1);
}

export { MemoryMCPServer } from "./server.js";
export { MemoryStore } from "./store.js";
export { EmbeddingEngine } from "./embeddings.js";
export { MemoryMCPTools } from "./tools.js";
export * from "./types.js";
