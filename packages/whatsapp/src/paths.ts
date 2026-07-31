import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DEFAULT_ROOT = join(homedir(), ".arvore-mcp", "whatsapp");

export function getDataRoot(): string {
  const root = process.env.WHATSAPP_MCP_DATA_DIR || DEFAULT_ROOT;
  mkdirSync(root, { recursive: true });
  return root;
}

export function getSessionsRoot(): string {
  const dir = join(getDataRoot(), "sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSessionRoot(key: string): string {
  const slug = sessionSlug(key);
  if (!slug) {
    throw new Error("session key cannot be empty");
  }
  const dir = join(getSessionsRoot(), slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function sessionSlug(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

export function getAuthDir(root: string = getDataRoot()): string {
  const dir = join(root, "auth");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDatabasePath(root: string = getDataRoot()): string {
  return join(root, "messages.db");
}

export function getQrPngPath(root: string = getDataRoot()): string {
  return join(root, "qr.png");
}
