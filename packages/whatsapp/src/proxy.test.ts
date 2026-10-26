import { mkdtempSync, rmSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonProxy } from "./proxy.js";

type Message = { id?: number; method?: string; result?: { connection: number }; error?: { message: string } };

class FakeDaemon {
  readonly received: Message[] = [];
  private readonly sockets = new Set<Socket>();
  private server: Server | null = null;
  private connections = 0;

  constructor(readonly path: string) {}

  async start(): Promise<void> {
    this.server = createServer((socket) => {
      const connection = ++this.connections;
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline !== -1) {
          const message = JSON.parse(buffer.slice(0, newline)) as Message;
          buffer = buffer.slice(newline + 1);
          this.received.push(message);
          if (message.id !== undefined && message.method !== "hang") {
            socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { connection } })}\n`);
          }
          newline = buffer.indexOf("\n");
        }
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(this.path, resolve));
  }

  crash(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async stop(): Promise<void> {
    this.crash();
    if (this.server) await new Promise((resolve) => this.server!.close(resolve));
  }
}

function collect(stream: PassThrough): Message[] {
  const messages: Message[] = [];
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      messages.push(JSON.parse(buffer.slice(0, newline)));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  });
  return messages;
}

async function until(check: () => boolean): Promise<void> {
  for (let waited = 0; waited < 2_000; waited += 10) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not met in time");
}

describe("DaemonProxy", () => {
  let root: string;
  let daemon: FakeDaemon;
  let input: PassThrough;
  let output: PassThrough;
  let out: Message[];
  let proxy: DaemonProxy | null;

  const send = (message: Message) => input.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "wa-proxy-"));
    daemon = new FakeDaemon(join(root, "d.sock"));
    input = new PassThrough();
    output = new PassThrough();
    out = collect(output);
    proxy = null;
  });

  afterEach(async () => {
    proxy?.close();
    await daemon.stop();
    rmSync(root, { recursive: true, force: true });
  });

  function startProxy(connect?: () => Promise<Socket>): Promise<void> {
    proxy = new DaemonProxy({
      input,
      output,
      connect:
        connect ??
        (() =>
          new Promise((resolve, reject) => {
            const socket = createConnection(daemon.path, () => resolve(socket));
            socket.once("error", reject);
          })),
      onClose: () => undefined,
      retryDelayMs: 20,
    });
    return proxy.start();
  }

  it("survives a daemon restart without the client noticing the handshake again", async () => {
    await daemon.start();
    await startProxy();

    send({ id: 0, method: "initialize" });
    send({ method: "notifications/initialized" });
    send({ id: 1, method: "hang" });
    await until(() => out.length === 1 && daemon.received.length === 3);

    daemon.crash();
    await until(() => daemon.received.length === 5);

    expect(daemon.received.slice(3).map((m) => m.method)).toEqual(["initialize", "notifications/initialized"]);
    expect(out.find((m) => m.id === 1)?.error?.message).toMatch(/Check whether the action happened/);

    send({ id: 2, method: "tools/call" });
    await until(() => out.some((m) => m.id === 2));

    expect(out.filter((m) => m.id === 0)).toHaveLength(1);
    expect(out.find((m) => m.id === 2)?.result?.connection).toBe(2);
    expect(out.some((m) => m.method === "notifications/tools/list_changed")).toBe(true);
  });

  it("holds requests sent before the daemon is up and delivers them in order", async () => {
    send({ id: 0, method: "initialize" });
    send({ id: 1, method: "tools/list" });
    const started = startProxy(async () => {
      await daemon.start();
      return new Promise((resolve) => {
        const socket = createConnection(daemon.path, () => resolve(socket));
      });
    });
    await started;
    await until(() => out.length === 2);

    expect(daemon.received.map((m) => m.method)).toEqual(["initialize", "tools/list"]);
    expect(out.map((m) => m.id)).toEqual([0, 1]);
  });

  it("answers queued requests with an error while the daemon cannot start", async () => {
    await startProxy(() => Promise.reject(new Error("spawn failed")));
    send({ id: 7, method: "tools/call" });

    await until(() => out.some((m) => m.id === 7));
    expect(out.find((m) => m.id === 7)?.error?.message).toMatch(/not running/);
  });
});
