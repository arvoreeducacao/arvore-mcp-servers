import { LogCollector } from "./log-collector.js";
import type { Framework, LogLevel } from "./types.js";

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const LEVEL_MAP: Record<ConsoleMethod, LogLevel> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

export class RuntimeInterceptor {
  private originalConsole: Record<ConsoleMethod, (...args: unknown[]) => void> = {} as any;
  private intercepting = false;
  private readonly collector: LogCollector;
  private readonly framework: Framework;

  constructor(collector: LogCollector, framework: Framework = "unknown") {
    this.collector = collector;
    this.framework = framework;
  }

  startIntercepting(): void {
    if (this.intercepting) return;

    const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];

    for (const method of methods) {
      this.originalConsole[method] = console[method].bind(console);

      console[method] = (...args: unknown[]) => {
        this.collector.addLog({
          level: LEVEL_MAP[method],
          message: args.map((a) => this.serialize(a)).join(" "),
          source: "console",
          framework: this.framework,
          stackTrace: method === "error" ? this.captureStack() : undefined,
          metadata: args.length === 1 && typeof args[0] === "object" ? args[0] as Record<string, unknown> : undefined,
        });

        this.originalConsole[method](...args);
      };
    }

    this.interceptStderr();
    this.interceptUncaughtErrors();

    this.intercepting = true;
  }

  stopIntercepting(): void {
    if (!this.intercepting) return;

    const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];
    for (const method of methods) {
      if (this.originalConsole[method]) {
        console[method] = this.originalConsole[method];
      }
    }

    this.intercepting = false;
  }

  isActive(): boolean {
    return this.intercepting;
  }

  private interceptStderr(): void {
    const originalWrite = process.stderr.write.bind(process.stderr);

    process.stderr.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void
    ): boolean => {
      const text = typeof chunk === "string" ? chunk : chunk.toString();

      if (text.trim() && !text.includes("MCP Server")) {
        this.collector.addLog({
          level: this.inferLevel(text),
          message: text.trim(),
          source: "stderr",
          framework: this.framework,
          stackTrace: text.includes("Error") ? text : undefined,
        });
      }

      if (typeof encodingOrCallback === "function") {
        return originalWrite(chunk, encodingOrCallback);
      }
      return originalWrite(chunk, encodingOrCallback, callback);
    }) as typeof process.stderr.write;
  }

  private interceptUncaughtErrors(): void {
    process.on("uncaughtException", (error) => {
      this.collector.addLog({
        level: "fatal",
        message: error.message,
        source: "uncaughtException",
        framework: this.framework,
        stackTrace: error.stack,
        metadata: { name: error.name },
      });
    });

    process.on("unhandledRejection", (reason) => {
      this.collector.addLog({
        level: "error",
        message: reason instanceof Error ? reason.message : String(reason),
        source: "unhandledRejection",
        framework: this.framework,
        stackTrace: reason instanceof Error ? reason.stack : undefined,
      });
    });
  }

  private serialize(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return value;
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack}`;
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
    return String(value);
  }

  private captureStack(): string {
    const stack = new Error().stack || "";
    return stack
      .split("\n")
      .slice(3)
      .filter((line) => !line.includes("runtime-interceptor"))
      .join("\n");
  }

  private inferLevel(text: string): LogLevel {
    const lower = text.toLowerCase();
    if (lower.includes("fatal") || lower.includes("critical")) return "fatal";
    if (lower.includes("error")) return "error";
    if (lower.includes("warn")) return "warn";
    if (lower.includes("debug") || lower.includes("verbose")) return "debug";
    return "info";
  }
}
