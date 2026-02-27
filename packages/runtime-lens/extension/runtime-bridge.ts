import * as vscode from "vscode";
import { request } from "node:http";
import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import { InlineDecorator } from "./decorator.js";

interface AgentMessage {
  type: "log" | "error" | "warn" | "info" | "debug" | "result";
  file: string;
  line: number;
  column: number;
  values: string[];
  timestamp: number;
  expression?: string;
}

export class RuntimeBridge {
  private socket: Socket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly decorator: InlineDecorator;
  private readonly port: number;
  private connected = false;
  private readonly outputChannel: vscode.OutputChannel;
  private dataBuffer: Buffer = Buffer.alloc(0);

  constructor(decorator: InlineDecorator, outputChannel: vscode.OutputChannel) {
    this.decorator = decorator;
    this.port = vscode.workspace.getConfiguration("runtimeLens").get("port", 9500);
    this.outputChannel = outputChannel;
  }

  connect(): void {
    if (this.socket) return;

    const key = randomBytes(16).toString("base64");

    const req = request({
      hostname: "localhost",
      port: this.port,
      path: "/",
      method: "GET",
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
      },
    });

    req.on("upgrade", (_res, socket) => {
      this.socket = socket;
      this.connected = true;
      this.dataBuffer = Buffer.alloc(0);
      this.outputChannel.appendLine(`[runtime-lens] Connected to agent on port ${this.port}`);
      vscode.window.setStatusBarMessage("$(eye) Runtime Lens: Connected", 3000);

      socket.on("data", (data: Buffer) => {
        this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
        this.processFrames();
      });

      socket.on("close", () => {
        this.connected = false;
        this.socket = null;
        this.scheduleReconnect();
      });

      socket.on("error", () => {
        this.connected = false;
        this.socket = null;
      });
    });

    req.on("error", () => {
      this.scheduleReconnect();
    });

    req.end();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  evaluate(expression: string, file: string, line: number): void {
    if (!this.socket || !this.connected) return;
    const payload = JSON.stringify({ type: "eval", expression, file, line });
    this.sendFrame(payload);
  }

  private processFrames(): void {
    while (this.dataBuffer.length >= 2) {
      const firstByte = this.dataBuffer[0];
      const secondByte = this.dataBuffer[1];
      const isFin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;

      if (opcode === 0x08) {
        this.socket?.end();
        return;
      }

      let payloadLen = secondByte & 0x7f;
      let headerLen = 2;

      if (payloadLen === 126) {
        if (this.dataBuffer.length < 4) return;
        payloadLen = this.dataBuffer.readUInt16BE(2);
        headerLen = 4;
      } else if (payloadLen === 127) {
        if (this.dataBuffer.length < 10) return;
        payloadLen = Number(this.dataBuffer.readBigUInt64BE(2));
        headerLen = 10;
      }

      const totalLen = headerLen + payloadLen;
      if (this.dataBuffer.length < totalLen) return;

      const payload = this.dataBuffer.subarray(headerLen, totalLen);
      this.dataBuffer = this.dataBuffer.subarray(totalLen);

      if (isFin && (opcode === 0x01 || opcode === 0x02)) {
        const text = payload.toString("utf-8");
        try {
          const msg: AgentMessage = JSON.parse(text);
          this.handleMessage(msg);
        } catch {
          // invalid JSON
        }
      }
    }
  }

  private sendFrame(text: string): void {
    if (!this.socket) return;
    const data = Buffer.from(text, "utf-8");
    const len = data.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    this.socket.write(Buffer.concat([header, data]));
  }

  private handleMessage(msg: AgentMessage): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    let resolvedFile = msg.file;
    for (const folder of workspaceFolders) {
      if (msg.file.startsWith(folder.uri.fsPath)) {
        resolvedFile = msg.file;
        break;
      }
    }

    const text = msg.values.join(", ");

    this.decorator.addValue({
      file: resolvedFile,
      line: msg.line,
      column: msg.column,
      text,
      type: msg.type,
      timestamp: msg.timestamp,
    });

    this.outputChannel.appendLine(
      `[${msg.type}] ${resolvedFile}:${msg.line} → ${text}`
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}
