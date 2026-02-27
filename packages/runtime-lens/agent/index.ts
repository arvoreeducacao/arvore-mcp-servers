import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createServer } from "node:http";
import type { Socket } from "node:net";

const PORT = parseInt(process.env.RUNTIME_LENS_PORT || "9500", 10);

interface LogMessage {
	type: "log" | "error" | "warn" | "info" | "debug" | "result";
	file: string;
	line: number;
	column: number;
	values: string[];
	timestamp: number;
	expression?: string;
	count?: number;
}

const clients: Set<Socket> = new Set();
const buffer: LogMessage[] = [];
const MAX_BUFFER = 1000;

function serialize(value: unknown, depth = 0): string {
	if (depth > 3) return "[...]";
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string")
		return value.length > 100 ? `"${value.slice(0, 100)}..."` : `"${value}"`;
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (typeof value === "function") return `fn ${value.name || "anonymous"}()`;
	if (typeof value === "symbol") return value.toString();
	if (typeof value === "bigint") return `${value}n`;
	if (value instanceof Error)
		return `${value.name}: ${value.message}${value.stack ? "\n" + value.stack : ""}`;
	if (value instanceof Date) return value.toISOString();
	if (value instanceof RegExp) return value.toString();
	if (value instanceof Map) return `Map(${value.size})`;
	if (value instanceof Set) return `Set(${value.size})`;
	if (value instanceof Promise) return "Promise";
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.slice(0, 5).map((v) => serialize(v, depth + 1));
		const suffix = value.length > 5 ? `, ...+${value.length - 5}` : "";
		return `[${items.join(", ")}${suffix}]`;
	}
	if (typeof value === "object") {
		const keys = Object.keys(value);
		if (keys.length === 0) return "{}";
		const entries = keys
			.slice(0, 5)
			.map(
				(k) =>
					`${k}: ${serialize((value as Record<string, unknown>)[k], depth + 1)}`,
			);
		const suffix = keys.length > 5 ? `, ...+${keys.length - 5}` : "";
		return `{${entries.join(", ")}${suffix}}`;
	}
	return typeof value === "object"
		? Object.prototype.toString.call(value)
		: String(value);
}

function broadcast(msg: LogMessage): void {
	const payload = JSON.stringify(msg);
	const buf = Buffer.from(payload, "utf-8");
	const frame = buildWsFrame(buf);

	for (const client of clients) {
		if (!client.destroyed) {
			client.write(frame);
		} else {
			clients.delete(client);
		}
	}

	// Always buffer for late-connecting clients (MCP server, extension)
	buffer.push(msg);
	if (buffer.length > MAX_BUFFER) buffer.shift();
}

function flushBuffer(socket: Socket): void {
	for (const msg of buffer) {
		const buf = Buffer.from(JSON.stringify(msg), "utf-8");
		socket.write(buildWsFrame(buf));
	}
}

function buildWsFrame(data: Buffer): Buffer {
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
	return Buffer.concat([header, data]);
}

function parseWsFrame(data: Buffer): string | null {
	if (data.length < 2) return null;
	const masked = (data[1] & 0x80) !== 0;
	let payloadLen = data[1] & 0x7f;
	let offset = 2;

	if (payloadLen === 126) {
		payloadLen = data.readUInt16BE(2);
		offset = 4;
	} else if (payloadLen === 127) {
		payloadLen = Number(data.readBigUInt64BE(2));
		offset = 10;
	}

	let maskKey: Buffer | null = null;
	if (masked) {
		maskKey = data.subarray(offset, offset + 4);
		offset += 4;
	}

	const payload = data.subarray(offset, offset + payloadLen);
	if (maskKey) {
		for (let i = 0; i < payload.length; i++) {
			payload[i] ^= maskKey[i % 4];
		}
	}
	return payload.toString("utf-8");
}

function extractCallSite(): { file: string; line: number; column: number } {
	const stack = new Error().stack || "";
	const lines = stack.split("\n");
	for (let i = 2; i < lines.length; i++) {
		const line = lines[i];
		if (line.includes("node:") || line.includes("dist/agent/index.js"))
			continue;
		const match =
			/\((.+):(\d+):(\d+)\)/.exec(line) || /at (.+):(\d+):(\d+)/.exec(line);
		if (match) {
			return {
				file: match[1],
				line: parseInt(match[2], 10),
				column: parseInt(match[3], 10),
			};
		}
	}
	return { file: "unknown", line: 0, column: 0 };
}

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";
const originalConsole: Record<ConsoleMethod, (...args: unknown[]) => void> = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug.bind(console),
};

const DEBUG = !!process.env.RUNTIME_LENS_DEBUG;
function agentLog(...args: unknown[]): void {
	if (DEBUG) originalConsole.error("[runtime-lens]", ...args);
}

function patchConsole(): void {
	const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];
	for (const method of methods) {
		console[method] = (...args: unknown[]) => {
			const site = extractCallSite();
			broadcast({
				type: method,
				file: site.file,
				line: site.line,
				column: site.column,
				values: args.map((a) => serialize(a)),
				timestamp: Date.now(),
			});
			originalConsole[method](...args);
		};
	}
}

const server = createServer((_req, res) => {
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(
		JSON.stringify({
			status: "ok",
			pid: process.pid,
			uptime: process.uptime(),
			clients: clients.size,
			buffered: buffer.length,
		}),
	);
});

server.on("upgrade", (req: IncomingMessage, socket: Socket) => {
	const key = req.headers["sec-websocket-key"];
	if (!key) {
		socket.destroy();
		return;
	}

	const acceptKey = createHash("sha1")
		.update(key + "258EAFA5-E914-47DA-95CA-5AB5DC11650B")
		.digest("base64");

	socket.write(
		"HTTP/1.1 101 Switching Protocols\r\n" +
			"Upgrade: websocket\r\n" +
			"Connection: Upgrade\r\n" +
			`Sec-WebSocket-Accept: ${acceptKey}\r\n` +
			"\r\n",
	);

	clients.add(socket);
	agentLog(`client connected (${clients.size} total)`);

	flushBuffer(socket);

	socket.on("data", (data: Buffer) => {
		const text = parseWsFrame(data);
		if (!text) return;
		try {
			const msg = JSON.parse(text);
			if (msg.type === "eval") {
				try {
					const fn = new Function(`return (${msg.expression})`);
					const result = fn();
					broadcast({
						type: "result",
						file: msg.file || "eval",
						line: msg.line || 0,
						column: msg.column || 0,
						values: [serialize(result)],
						timestamp: Date.now(),
						expression: msg.expression,
					});
				} catch (err: unknown) {
					broadcast({
						type: "error",
						file: msg.file || "eval",
						line: msg.line || 0,
						column: msg.column || 0,
						values: [err instanceof Error ? err.message : String(err)],
						timestamp: Date.now(),
						expression: msg.expression,
					});
				}
			} else if (msg.type === "get_buffer") {
				const payload = JSON.stringify({ type: "buffer", logs: buffer });
				const buf = Buffer.from(payload, "utf-8");
				socket.write(buildWsFrame(buf));
			}
		} catch {
			// invalid JSON
		}
	});

	socket.on("close", () => {
		clients.delete(socket);
		agentLog(`client disconnected (${clients.size} total)`);
	});

	socket.on("error", () => {
		clients.delete(socket);
	});
});

server.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EADDRINUSE") {
		agentLog(`port ${PORT} in use, skipping agent server`);
	}
});

server.listen(PORT, () => {
	agentLog(`agent listening on ws://localhost:${PORT}`);
});

let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
const KEEP_ALIVE_MS = parseInt(
	process.env.RUNTIME_LENS_KEEP_ALIVE || "30000",
	10,
);

function scheduleShutdown(): void {
	if (keepAliveTimer) return;
	keepAliveTimer = setTimeout(() => {
		if (clients.size === 0) {
			agentLog(`no clients connected, shutting down agent`);
			server.close();
			process.exit(0);
		} else {
			keepAliveTimer = null;
			scheduleShutdown();
		}
	}, KEEP_ALIVE_MS);
	keepAliveTimer.unref();
}

process.on("beforeExit", () => {
	server.ref();
	scheduleShutdown();
});

patchConsole();

(globalThis as Record<string, unknown>).__runtimeLens = {
	log: (...args: unknown[]) => {
		const site = extractCallSite();
		broadcast({
			type: "result",
			file: site.file,
			line: site.line,
			column: site.column,
			values: args.map((a) => serialize(a)),
			timestamp: Date.now(),
		});
	},
};
