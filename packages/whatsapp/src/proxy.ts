import type { Socket } from "node:net";
import type { Readable, Writable } from "node:stream";
import { ensureDaemon } from "./daemon.js";
import { getDataRoot } from "./paths.js";

type RequestId = string | number;

type JsonRpcMessage = {
  id?: RequestId | null;
  method?: string;
};

export type DaemonProxyOptions = {
  input: Readable;
  output: Writable;
  connect: (reconnecting: boolean) => Promise<Socket>;
  onClose: () => void;
  retryDelayMs?: number;
  log?: (line: string) => void;
};

const LOST_ANSWER =
  "Lost the connection to the WhatsApp daemon before it answered. Check whether the action happened before retrying it.";
const DAEMON_DOWN = "The WhatsApp daemon is not running and could not be started.";

/**
 * Pipes one MCP session between the client's stdio and the shared daemon.
 * When the daemon restarts, it replays this session's initialize handshake
 * on the new connection and hides the duplicate answer from the client.
 */
export class DaemonProxy {
  private socket: Socket | null = null;
  private initialize: string | null = null;
  private initialized: string | null = null;
  private replayedInitializeId: RequestId | null = null;
  private readonly pending = new Set<RequestId>();
  private queue: string[] = [];
  private closed = false;

  constructor(private readonly options: DaemonProxyOptions) {}

  async start(): Promise<void> {
    const { input, output } = this.options;
    input.setEncoding("utf8");
    onLines(input, (line) => this.fromClient(line));
    input.once("end", () => this.close());
    output.on("error", () => this.close());

    try {
      this.attach(await this.options.connect(false), false);
    } catch (error) {
      this.log(`${error}`);
      void this.reconnect();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket?.end();
    this.socket = null;
    this.options.onClose();
  }

  private fromClient(line: string): void {
    const message = parse(line);
    if (message?.method === "initialize" && message.id != null) this.initialize = line;
    if (message?.method === "notifications/initialized") this.initialized = line;
    if (message?.method && message.id != null) this.pending.add(message.id);

    if (this.socket) this.socket.write(`${line}\n`);
    else this.queue.push(line);
  }

  private fromDaemon(line: string): void {
    const message = parse(line);
    if (message && !message.method && message.id != null) {
      if (message.id === this.replayedInitializeId) {
        this.replayedInitializeId = null;
        return;
      }
      this.pending.delete(message.id);
    }
    this.options.output.write(`${line}\n`);
  }

  private attach(socket: Socket, reconnected: boolean): void {
    socket.setEncoding("utf8");
    onLines(socket, (line) => this.fromDaemon(line));
    socket.on("error", (error) => this.log(`daemon socket: ${error}`));
    socket.once("close", () => this.lost(socket));

    const handshakeDelivered = this.initialize !== null && !this.queue.includes(this.initialize);
    if (reconnected && this.initialize && handshakeDelivered) {
      this.replayedInitializeId = parse(this.initialize)?.id ?? null;
      socket.write(`${this.initialize}\n`);
      if (this.initialized && !this.queue.includes(this.initialized)) socket.write(`${this.initialized}\n`);
      this.options.output.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })}\n`
      );
    }

    this.socket = socket;
    for (const line of this.queue.splice(0)) socket.write(`${line}\n`);
  }

  private lost(socket: Socket): void {
    if (this.socket !== socket || this.closed) return;
    this.socket = null;
    this.replayedInitializeId = null;
    for (const id of this.pending) this.answerWithError(id, LOST_ANSWER);
    this.pending.clear();
    this.log("lost the daemon, reconnecting");
    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    while (!this.closed) {
      try {
        this.attach(await this.options.connect(true), true);
        return;
      } catch (error) {
        this.log(`reconnect failed: ${error}`);
        this.failQueued();
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 2_000));
      }
    }
  }

  private failQueued(): void {
    for (const line of this.queue.splice(0)) {
      const message = parse(line);
      if (!message?.method || message.id == null) continue;
      this.pending.delete(message.id);
      this.answerWithError(message.id, DAEMON_DOWN);
    }
  }

  private answerWithError(id: RequestId, text: string): void {
    this.options.output.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: text } })}\n`
    );
  }

  private log(line: string): void {
    this.options.log?.(line);
  }
}

export async function runStdioProxy(): Promise<void> {
  const root = getDataRoot();
  const proxy = new DaemonProxy({
    input: process.stdin,
    output: process.stdout,
    connect: (reconnecting) => ensureDaemon(root, { replaceOutdated: !reconnecting }),
    onClose: () => process.exit(0),
    log: (line) => process.stderr.write(`[whatsapp-mcp] ${line}\n`),
  });
  await proxy.start();
}

function parse(line: string): JsonRpcMessage | null {
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRpcMessage) : null;
  } catch {
    return null;
  }
}

function onLines(stream: Readable, onLine: (line: string) => void): void {
  let partial: string[] = [];
  stream.on("data", (chunk: string) => {
    let start = 0;
    let newline = chunk.indexOf("\n", start);
    while (newline !== -1) {
      partial.push(chunk.slice(start, newline));
      const line = partial.join("").replace(/\r$/, "");
      partial = [];
      if (line.trim()) onLine(line);
      start = newline + 1;
      newline = chunk.indexOf("\n", start);
    }
    if (start < chunk.length) partial.push(chunk.slice(start));
  });
}
