#!/usr/bin/env node

import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { MemoryMCPServer } from "./server.js";

const WORKSPACE_MARKERS = [".git", ".kiro", ".cursor", ".vscode", ".pi"];

function isWorkspaceDir(dir: string): boolean {
  return WORKSPACE_MARKERS.some((marker) => existsSync(resolve(dir, marker)));
}

function findWorkspaceRootFrom(startDir: string): string | null {
  if (!startDir || !existsSync(startDir)) return null;
  let dir = resolve(startDir);
  const root = resolve("/");
  while (dir !== root) {
    if (isWorkspaceDir(dir)) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function candidatesFromEnv(): string[] {
  const out: string[] = [];
  const push = (value?: string) => {
    if (!value) return;
    for (const part of value.split(/[,:]/)) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  };
  push(process.env.KIRO_WORKSPACE_FOLDERS);
  push(process.env.WORKSPACE_FOLDER_PATHS);
  push(process.env.VSCODE_CWD);
  push(process.env.PWD);
  push(process.env.INIT_CWD);
  return out;
}

function findWorkspaceRoot(): string | null {
  const direct = findWorkspaceRootFrom(process.cwd());
  if (direct) return direct;

  for (const candidate of candidatesFromEnv()) {
    const resolved = isAbsolute(candidate)
      ? candidate
      : resolve(process.cwd(), candidate);
    if (isWorkspaceDir(resolved)) return resolved;
    const walked = findWorkspaceRootFrom(resolved);
    if (walked) return walked;
  }

  return null;
}

function safeFallbackDir(): string {
  return resolve(homedir(), ".arvoretech", "memory-mcp");
}

function resolveMemoriesPath(): string {
  const envPath = process.env.MEMORY_PATH;

  if (envPath && isAbsolute(envPath)) {
    return envPath;
  }

  const relative = envPath ?? "memories";
  const workspaceRoot = findWorkspaceRoot();

  if (workspaceRoot) {
    return resolve(workspaceRoot, relative);
  }

  const fallback = resolve(safeFallbackDir(), relative);
  console.error(
    `[memory-mcp] Could not detect workspace root from cwd=${process.cwd()}. ` +
      `Falling back to ${fallback}. ` +
      `Set MEMORY_PATH to an absolute path or ensure the MCP is launched with ` +
      `cwd inside a workspace (containing ${WORKSPACE_MARKERS.join(", ")}).`,
  );
  return fallback;
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
