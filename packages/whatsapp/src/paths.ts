import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const DEFAULT_ROOT = join(homedir(), ".arvore-mcp", "whatsapp");

export function getDataRoot(): string {
  const root = process.env.WHATSAPP_MCP_DATA_DIR || DEFAULT_ROOT;
  mkdirSync(root, { recursive: true });
  return root;
}

export function getAuthDir(): string {
  const dir = join(getDataRoot(), "auth");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDatabasePath(): string {
  return join(getDataRoot(), "messages.db");
}

export function getQrPngPath(): string {
  return join(getDataRoot(), "qr.png");
}
