import { randomBytes } from "node:crypto";
import { request } from "node:http";
import type { Socket } from "node:net";
import type { LogCollector } from "./log-collector.js";

interface AgentMessage {
	type: "log" | "error" | "warn" | "info" | "debug" | "result" | "buffer";
	file: string;
	line: number;
	column: number;
	values: string[];
	timestamp: number;
	expression?: string;
	logs?: AgentMessage[];
}

const LEVEL_MAP: Record<string, "debug" | "info" | "warn" | "error" | "fatal"> =
	{
		log: "info",
		info: "info",
		warn: "warn",
		error: "error",
		debug: "debug",
		result: "info",
	};

export class AgentBridge {
	private socket: Socket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connected = false;
	private readonly port: number;
	private readonly collector: LogCollector;
	private dataBuffer: Buffer = Buffer.alloc(0);
	private stopped = false;

	constructor(collector: LogCollector, port = 9500) {
		this.collector = collector;
		this.port = parseInt(process.env.RUNTIME_LENS_PORT || String(port), 10);
	}

	connect(): void {
		if (this.socket || this.stopped) return;

		const key = randomBytes(16).toString("base64");

		const req = request({
			hostname: "localhost",
			port: this.port,
			path: "/",
			method: "GET",
			timeout: 3000,
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
			console.error("[runtime-lens-mcp] Connected to agent on port", this.port);

			// Request buffered logs
			this.sendFrame(JSON.stringify({ type: "get_buffer" }));

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

		req.on("timeout", () => {
			req.destroy();
			this.scheduleReconnect();
		});

		req.end();
	}

	disconnect(): void {
		this.stopped = true;
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

	private handleMessage(msg: AgentMessage): void {
		if (msg.type === "buffer" && msg.logs) {
			for (const log of msg.logs) {
				this.ingestLog(log);
			}
			return;
		}

		this.ingestLog(msg);
	}

	private ingestLog(msg: AgentMessage): void {
		const level = LEVEL_MAP[msg.type] || "info";
		this.collector.addLog({
			level,
			message: msg.values.join(", "),
			source: msg.file || "agent",
			framework: "unknown",
			metadata: {
				line: msg.line,
				column: msg.column,
				agentType: msg.type,
				expression: msg.expression,
				originalTimestamp: msg.timestamp,
			},
		});
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

	private scheduleReconnect(): void {
		if (this.reconnectTimer || this.stopped) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 5000);
	}
}
