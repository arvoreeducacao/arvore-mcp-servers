import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDataRoot } from "./paths.js";

export type DaemonInfo = {
  pid: number;
  fingerprint: string;
  startedAt: string;
};

const SOCKET_PATH_LIMIT = 100;
const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
const UNWRITTEN_LOCK_GRACE_MS = 5_000;

export function daemonSocketPath(root: string = getDataRoot()): string {
  const local = join(root, "daemon.sock");
  if (Buffer.byteLength(local) <= SOCKET_PATH_LIMIT) return local;
  const digest = createHash("sha256").update(root).digest("hex").slice(0, 12);
  return join(tmpdir(), `whatsapp-mcp-${digest}.sock`);
}

function lockPath(root: string): string {
  return join(root, "daemon.json");
}

export function readDaemonInfo(root: string = getDataRoot()): DaemonInfo | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath(root), "utf-8")) as DaemonInfo;
    return typeof parsed.pid === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

export function codeFingerprint(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  const hash = createHash("sha256");
  for (const name of readdirSync(dir).sort()) {
    if (!/\.(js|ts|mjs)$/.test(name) || name.includes(".test.")) continue;
    const stat = statSync(join(dir, name));
    hash.update(`${name}:${stat.size}:${stat.mtimeMs};`);
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * One daemon per data dir. A stale lock (dead pid) is broken through a
 * `.stale-<pid>` marker created with O_EXCL, so two processes racing to
 * replace the same dead daemon cannot both win.
 */
export function claimDaemonLock(root: string, info: DaemonInfo): boolean {
  const path = lockPath(root);
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o600);
      writeSync(fd, JSON.stringify(info));
      closeSync(fd);
      return true;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
    }

    const owner = readDaemonInfo(root);
    if (owner && isAlive(owner.pid)) return false;
    if (!owner && Date.now() - mtimeMs(path) < UNWRITTEN_LOCK_GRACE_MS) {
      sleepSync(50);
      continue;
    }

    const breaker = `${path}.stale-${owner?.pid ?? "unwritten"}`;
    try {
      closeSync(openSync(breaker, "wx"));
    } catch {
      sleepSync(50);
      continue;
    }
    try {
      if (readDaemonInfo(root)?.pid === owner?.pid) rmSync(path, { force: true });
    } finally {
      rmSync(breaker, { force: true });
    }
  }
  return false;
}

export function releaseDaemonLock(root: string, pid: number): void {
  if (readDaemonInfo(root)?.pid === pid) rmSync(lockPath(root), { force: true });
}

function mtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export async function listenAsDaemon(
  root: string,
  onConnection: (socket: Socket) => void
): Promise<{ info: DaemonInfo; close: () => void } | null> {
  const info: DaemonInfo = {
    pid: process.pid,
    fingerprint: codeFingerprint(),
    startedAt: new Date().toISOString(),
  };
  if (!claimDaemonLock(root, info)) return null;

  const path = daemonSocketPath(root);
  rmSync(path, { force: true });
  const server = createServer((socket) => {
    socket.on("error", () => undefined);
    onConnection(socket);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => resolve());
    });
    chmodSync(path, 0o600);
  } catch (error) {
    releaseDaemonLock(root, info.pid);
    throw error;
  }

  return {
    info,
    close: () => {
      server.close();
      rmSync(path, { force: true });
      releaseDaemonLock(root, info.pid);
    },
  };
}

export function connectToDaemon(root: string = getDataRoot()): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(daemonSocketPath(root));
    socket.once("connect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

function spawnDaemon(root: string): void {
  const log = join(root, "daemon.log");
  if (existsSync(log) && statSync(log).size > LOG_ROTATE_BYTES) renameSync(log, `${log}.1`);
  const fd = openSync(log, "a", 0o600);
  const child = spawn(process.execPath, [...process.execArgv, process.argv[1], "daemon"], {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: process.env,
  });
  child.unref();
  closeSync(fd);
}

async function stopDaemon(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  for (let waited = 0; waited < 5_000 && isAlive(pid); waited += 100) {
    await delay(100);
  }
  if (isAlive(pid)) process.kill(pid, "SIGKILL");
}

export async function stopRunningDaemon(root: string = getDataRoot()): Promise<DaemonInfo | null> {
  const info = readDaemonInfo(root);
  if (!info || !isAlive(info.pid)) return null;
  await stopDaemon(info.pid);
  return info;
}

export async function ensureDaemon(
  root: string,
  options: { replaceOutdated: boolean; timeoutMs?: number }
): Promise<Socket> {
  const running = readDaemonInfo(root);
  if (options.replaceOutdated && running && isAlive(running.pid) && running.fingerprint !== codeFingerprint()) {
    process.stderr.write(`[whatsapp-mcp] restarting daemon ${running.pid}: its code is outdated\n`);
    await stopDaemon(running.pid);
  }

  try {
    return await connectToDaemon(root);
  } catch {
    spawnDaemon(root);
  }

  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  let lastError: unknown;
  while (Date.now() < deadline) {
    await delay(150);
    try {
      return await connectToDaemon(root);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `WhatsApp daemon did not start: ${lastError}. See ${join(root, "daemon.log")}.`
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
