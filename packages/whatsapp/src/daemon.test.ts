import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimDaemonLock, connectToDaemon, daemonSocketPath, listenAsDaemon, readDaemonInfo, type DaemonInfo } from "./daemon.js";

function deadPid(): number {
  return spawnSync(process.execPath, ["-e", ""]).pid!;
}

function info(pid: number): DaemonInfo {
  return { pid, fingerprint: "test", startedAt: new Date(0).toISOString() };
}

describe("daemon lock", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wa-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lets only one live daemon own a data dir", () => {
    expect(claimDaemonLock(root, info(process.pid))).toBe(true);
    expect(claimDaemonLock(root, info(process.pid + 1))).toBe(false);
    expect(readDaemonInfo(root)?.pid).toBe(process.pid);
  });

  it("takes over the lock of a daemon that died", () => {
    writeFileSync(join(root, "daemon.json"), JSON.stringify(info(deadPid())));
    expect(claimDaemonLock(root, info(process.pid))).toBe(true);
    expect(readDaemonInfo(root)?.pid).toBe(process.pid);
  });

  it("takes over a lock left empty by a daemon that crashed while writing it", () => {
    const path = join(root, "daemon.json");
    writeFileSync(path, "");
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(path, longAgo, longAgo);
    expect(claimDaemonLock(root, info(process.pid))).toBe(true);
  });

  it("serves on a socket only the owner can open and cleans up on close", async () => {
    const daemon = await listenAsDaemon(root, (socket) => socket.end("hello\n"));
    expect(daemon).not.toBeNull();
    expect(statSync(daemonSocketPath(root)).mode & 0o777).toBe(0o600);

    const socket = await connectToDaemon(root);
    const greeting = await new Promise<string>((resolve) => socket.once("data", (data) => resolve(String(data))));
    expect(greeting).toBe("hello\n");

    daemon!.close();
    expect(() => readFileSync(join(root, "daemon.json"))).toThrow();
    await expect(connectToDaemon(root)).rejects.toThrow();
  });

  it("moves the socket to the temp dir when the data dir path is too long for a unix socket", () => {
    expect(daemonSocketPath(join("/x", "y".repeat(120)))).toMatch(/whatsapp-mcp-[0-9a-f]{12}\.sock$/);
  });
});
