import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface LockInfo {
  pid: number;
  port: number;
}

const LOCK_FILENAME = "mcp-proxy.lock";

function getLockPath(): string {
  const dir = process.env.MCP_PROXY_LOCK_DIR || tmpdir();
  return join(dir, LOCK_FILENAME);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function tryAcquireLock(port: number): boolean {
  const lockPath = getLockPath();

  try {
    const fd = openSync(lockPath, "wx");
    try {
      const info: LockInfo = { pid: process.pid, port };
      writeSync(fd, JSON.stringify(info));
      return true;
    } finally {
      closeSync(fd);
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "EEXIST") throw err;
  }

  const existing = readLock();
  if (!existing) {
    return false;
  }

  if (!isProcessAlive(existing.pid)) {
    console.error(`[singleton] Stale lock (pid ${existing.pid} dead), taking over`);
    unlinkSync(lockPath);
    return tryAcquireLock(port);
  }

  return false;
}

export function readLock(): LockInfo | null {
  const lockPath = getLockPath();
  try {
    if (!existsSync(lockPath)) return null;
    const raw = readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.pid === "number" && typeof parsed.port === "number") {
      return parsed as LockInfo;
    }
    return null;
  } catch {
    return null;
  }
}

export function releaseLock(): void {
  const lockPath = getLockPath();
  try {
    const existing = readLock();
    if (existing && existing.pid === process.pid) {
      unlinkSync(lockPath);
      console.error("[singleton] Lock released");
    }
  } catch {
    // best-effort
  }
}
