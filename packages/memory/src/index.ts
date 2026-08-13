#!/usr/bin/env node

import { resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { MemoryMCPServer } from "./server.js";

const WORKSPACE_MARKERS = [".git", ".kiro", ".cursor", ".vscode", ".pi"];
const HTTP_TRANSPORT_NAMES = ["http", "streamable-http", "streamable_http"];

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

function resolveMemoriesPath(transport: "stdio" | "http"): string {
  const envPath = process.env.MEMORY_PATH;

  if (envPath && isAbsolute(envPath)) {
    return envPath;
  }

  const relative = envPath ?? "memories";

  if (transport === "http") {
    return resolve("/data", relative);
  }

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

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    process.stderr.write(`Error: invalid port "${value}"\n`);
    process.exit(1);
  }
  return parsed;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const transportEnv = (process.env.MCP_TRANSPORT || "stdio").trim().toLowerCase();

if (transportEnv !== "stdio" && !HTTP_TRANSPORT_NAMES.includes(transportEnv)) {
  process.stderr.write(
    `Error: unknown MCP_TRANSPORT "${process.env.MCP_TRANSPORT}".\n` +
      `Supported values: stdio, ${HTTP_TRANSPORT_NAMES.join(", ")}.\n`
  );
  process.exit(1);
}

const transport = transportEnv === "stdio" ? "stdio" : "http";
const authToken = process.env.MCP_AUTH_TOKEN || "";

if (transport === "http" && authToken.length < 16) {
  process.stderr.write(
    "Error: MCP_AUTH_TOKEN with at least 16 characters is required for the http transport.\n" +
      "It guards /mcp and signs the tokens of the built-in OAuth server.\n" +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

const signInClientId = process.env.MEMORY_MCP_SIGNIN_CLIENT_ID;
const signInClientSecret = process.env.MEMORY_MCP_SIGNIN_CLIENT_SECRET;
const signInDomains = (process.env.MEMORY_MCP_SIGNIN_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

if ((signInClientId || signInClientSecret) && !(signInClientId && signInClientSecret)) {
  process.stderr.write(
    "Error: MEMORY_MCP_SIGNIN_CLIENT_ID and MEMORY_MCP_SIGNIN_CLIENT_SECRET must be set together.\n"
  );
  process.exit(1);
}

if (signInClientId && signInDomains.length === 0) {
  process.stderr.write(
    "Error: MEMORY_MCP_SIGNIN_DOMAINS is required when Google sign-in is enabled.\n" +
      "List the email domains allowed to connect, e.g. MEMORY_MCP_SIGNIN_DOMAINS=arvore.com.br\n"
  );
  process.exit(1);
}

const publicUrl = process.env.MCP_PUBLIC_URL?.trim() || undefined;

if (publicUrl && !isAbsoluteHttpUrl(publicUrl)) {
  process.stderr.write(
    `Error: MCP_PUBLIC_URL must be an absolute http(s) URL, got "${publicUrl}".\n`
  );
  process.exit(1);
}

try {
  const server = new MemoryMCPServer({
    memoriesPath: resolveMemoriesPath(transport),
    embeddingModel: process.env.MEMORY_EMBEDDING_MODEL,
    transport,
    host: process.env.HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 8080),
    authToken,
    publicUrl,
    author: process.env.MEMORY_AUTHOR?.trim() || undefined,
    googleSignIn:
      signInClientId && signInClientSecret
        ? {
            clientId: signInClientId,
            clientSecret: signInClientSecret,
            allowedDomains: signInDomains,
          }
        : undefined,
  });

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
