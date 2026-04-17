#!/usr/bin/env node

import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { MemoryMCPServer } from "./server.js";

function findWorkspaceRoot(startDir: string): string {
  let dir = startDir;
  const root = resolve("/");
  while (dir !== root) {
    if (
      existsSync(resolve(dir, ".git")) ||
      existsSync(resolve(dir, ".kiro")) ||
      existsSync(resolve(dir, ".cursor"))
    ) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function resolveMemoriesPath(): string {
  const envPath = process.env.MEMORY_PATH;

  if (!envPath) {
    return resolve(process.cwd(), "memories");
  }

  if (isAbsolute(envPath)) {
    return envPath;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  return resolve(workspaceRoot, envPath);
}

const memoriesPath = resolveMemoriesPath();
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
