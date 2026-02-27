import { randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import {
  LogEntry,
  LogLevel,
  Framework,
  HttpRequest,
  PerformanceMetric,
} from "./types.js";

const MAX_BUFFER_SIZE = 10000;

interface LogBuffer {
  logs: LogEntry[];
  requests: HttpRequest[];
  metrics: PerformanceMetric[];
}

export class LogCollector {
  private buffer: LogBuffer = {
    logs: [],
    requests: [],
    metrics: [],
  };

  private logPaths: string[];
  private projectRoot: string;

  constructor(projectRoot?: string, logPaths?: string[]) {
    this.projectRoot = projectRoot || process.cwd();
    this.logPaths = logPaths || [];
  }

  async collectFromFiles(): Promise<void> {
    const paths = this.logPaths.length > 0
      ? this.logPaths
      : await this.discoverLogFiles();

    for (const filePath of paths) {
      try {
        const content = await readFile(filePath, "utf-8");
        const entries = this.parseLogFile(content, filePath);
        this.addLogs(entries);
      } catch {
        // skip unreadable files
      }
    }
  }

  async collectFromProcess(): Promise<void> {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    this.addMetric({
      name: "memory.rss",
      value: mem.rss,
      unit: "bytes",
      timestamp: new Date().toISOString(),
      tags: { source: "process" },
    });

    this.addMetric({
      name: "memory.heap_used",
      value: mem.heapUsed,
      unit: "bytes",
      timestamp: new Date().toISOString(),
      tags: { source: "process" },
    });

    this.addMetric({
      name: "cpu.user",
      value: cpu.user,
      unit: "microseconds",
      timestamp: new Date().toISOString(),
      tags: { source: "process" },
    });

    this.addMetric({
      name: "cpu.system",
      value: cpu.system,
      unit: "microseconds",
      timestamp: new Date().toISOString(),
      tags: { source: "process" },
    });
  }

  async scanProjectStructure(): Promise<{
    framework: Framework;
    logFiles: string[];
    configFiles: string[];
  }> {
    const framework = await this.detectFramework();
    const logFiles = await this.discoverLogFiles();
    const configFiles = await this.discoverConfigFiles();

    return { framework, logFiles, configFiles };
  }

  addLog(entry: Omit<LogEntry, "id" | "timestamp">): void {
    this.buffer.logs.push({
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    });
    this.trimBuffer("logs");
  }

  addLogs(entries: LogEntry[]): void {
    this.buffer.logs.push(...entries);
    this.trimBuffer("logs");
  }

  addRequest(request: Omit<HttpRequest, "id" | "timestamp">): void {
    this.buffer.requests.push({
      ...request,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    });
    this.trimBuffer("requests");
  }

  addMetric(metric: PerformanceMetric): void {
    this.buffer.metrics.push(metric);
    this.trimBuffer("metrics");
  }

  getLogs(options?: {
    lines?: number;
    level?: LogLevel;
    framework?: Framework;
    source?: string;
  }): LogEntry[] {
    let logs = [...this.buffer.logs];

    if (options?.level) {
      logs = logs.filter((l) => l.level === options.level);
    }
    if (options?.framework) {
      logs = logs.filter((l) => l.framework === options.framework);
    }
    if (options?.source) {
      logs = logs.filter((l) => l.source?.includes(options.source!));
    }

    const limit = options?.lines || 50;
    return logs.slice(-limit);
  }

  searchLogs(options: {
    query: string;
    level?: LogLevel;
    framework?: Framework;
    limit?: number;
    since?: string;
  }): LogEntry[] {
    let logs = [...this.buffer.logs];
    const regex = new RegExp(options.query, "i");

    if (options.since) {
      const sinceDate = new Date(options.since);
      logs = logs.filter((l) => new Date(l.timestamp) >= sinceDate);
    }
    if (options.level) {
      logs = logs.filter((l) => l.level === options.level);
    }
    if (options.framework) {
      logs = logs.filter((l) => l.framework === options.framework);
    }

    logs = logs.filter(
      (l) =>
        regex.test(l.message) ||
        (l.stackTrace && regex.test(l.stackTrace)) ||
        (l.source && regex.test(l.source))
    );

    return logs.slice(-(options.limit || 50));
  }

  getErrors(options?: {
    limit?: number;
    framework?: Framework;
    grouped?: boolean;
  }): LogEntry[] | { message: string; count: number; lastSeen: string; sample: LogEntry }[] {
    let errors = this.buffer.logs.filter(
      (l) => l.level === "error" || l.level === "fatal"
    );

    if (options?.framework) {
      errors = errors.filter((l) => l.framework === options.framework);
    }

    if (options?.grouped) {
      const groups = new Map<string, { count: number; lastSeen: string; sample: LogEntry }>();
      for (const error of errors) {
        const key = error.message.slice(0, 100);
        const existing = groups.get(key);
        if (existing) {
          existing.count++;
          if (error.timestamp > existing.lastSeen) {
            existing.lastSeen = error.timestamp;
            existing.sample = error;
          }
        } else {
          groups.set(key, { count: 1, lastSeen: error.timestamp, sample: error });
        }
      }
      return Array.from(groups.entries())
        .map(([message, data]) => ({ message, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, options?.limit || 20);
    }

    return errors.slice(-(options?.limit || 20));
  }

  getRequests(options?: {
    id?: string;
    method?: string;
    urlPattern?: string;
    statusCode?: number;
    limit?: number;
  }): HttpRequest[] {
    let requests = [...this.buffer.requests];

    if (options?.id) {
      return requests.filter((r) => r.id === options.id);
    }
    if (options?.method) {
      requests = requests.filter((r) => r.method.toUpperCase() === options.method!.toUpperCase());
    }
    if (options?.urlPattern) {
      const regex = new RegExp(options.urlPattern, "i");
      requests = requests.filter((r) => regex.test(r.url));
    }
    if (options?.statusCode) {
      requests = requests.filter((r) => r.statusCode === options.statusCode);
    }

    return requests.slice(-(options?.limit || 20));
  }

  getMetrics(options?: {
    metric?: string;
    since?: string;
    limit?: number;
  }): PerformanceMetric[] {
    let metrics = [...this.buffer.metrics];

    if (options?.metric) {
      metrics = metrics.filter((m) => m.name.includes(options.metric!));
    }
    if (options?.since) {
      const sinceDate = new Date(options.since);
      metrics = metrics.filter((m) => new Date(m.timestamp) >= sinceDate);
    }

    return metrics.slice(-(options?.limit || 20));
  }

  clearLogs(): { cleared: number } {
    const count = this.buffer.logs.length + this.buffer.requests.length + this.buffer.metrics.length;
    this.buffer = { logs: [], requests: [], metrics: [] };
    return { cleared: count };
  }

  getStats(): {
    totalLogs: number;
    totalRequests: number;
    totalMetrics: number;
    byLevel: Record<string, number>;
    byFramework: Record<string, number>;
  } {
    const byLevel: Record<string, number> = {};
    const byFramework: Record<string, number> = {};

    for (const log of this.buffer.logs) {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
      const fw = log.framework || "unknown";
      byFramework[fw] = (byFramework[fw] || 0) + 1;
    }

    return {
      totalLogs: this.buffer.logs.length,
      totalRequests: this.buffer.requests.length,
      totalMetrics: this.buffer.metrics.length,
      byLevel,
      byFramework,
    };
  }

  private parseLogFile(content: string, filePath: string): LogEntry[] {
    const lines = content.split("\n").filter(Boolean);
    const entries: LogEntry[] = [];
    const framework = this.inferFramework(filePath);

    for (const line of lines) {
      const entry = this.parseLogLine(line, filePath, framework);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private parseLogLine(line: string, source: string, framework: Framework): LogEntry | null {
    const jsonMatch = this.tryParseJson(line);
    if (jsonMatch) {
      return {
        id: randomUUID(),
        timestamp: jsonMatch.timestamp || jsonMatch.time || new Date().toISOString(),
        level: this.normalizeLevel(jsonMatch.level || jsonMatch.severity || "info"),
        message: jsonMatch.message || jsonMatch.msg || JSON.stringify(jsonMatch),
        source: basename(source),
        framework,
        metadata: jsonMatch,
      };
    }

    const timestampRegex = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?)\s*/;
    const levelRegex = /\b(DEBUG|INFO|WARN|ERROR|FATAL|debug|info|warn|error|fatal)\b/;

    const tsMatch = line.match(timestampRegex);
    const lvlMatch = line.match(levelRegex);

    return {
      id: randomUUID(),
      timestamp: tsMatch?.[1] || new Date().toISOString(),
      level: this.normalizeLevel(lvlMatch?.[1] || "info"),
      message: line,
      source: basename(source),
      framework,
    };
  }

  private tryParseJson(line: string): Record<string, any> | null {
    try {
      const parsed = JSON.parse(line.trim());
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // not JSON
    }
    return null;
  }

  private normalizeLevel(level: string): LogLevel {
    const normalized = level.toLowerCase();
    if (["debug", "info", "warn", "error", "fatal"].includes(normalized)) {
      return normalized as LogLevel;
    }
    if (normalized === "warning") return "warn";
    if (normalized === "critical" || normalized === "emergency") return "fatal";
    if (normalized === "trace" || normalized === "verbose") return "debug";
    return "info";
  }

  private inferFramework(filePath: string): Framework {
    if (filePath.includes(".next") || filePath.includes("next")) return "nextjs";
    if (filePath.includes("nest") || filePath.includes("dist/main")) return "nestjs";
    if (filePath.includes("react") || filePath.includes("src/App")) return "react";
    return "unknown";
  }

  private async detectFramework(): Promise<Framework> {
    try {
      const pkgPath = join(this.projectRoot, "package.json");
      const content = await readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps["@nestjs/core"]) return "nestjs";
      if (deps["next"]) return "nextjs";
      if (deps["react"]) return "react";
    } catch {
      // no package.json
    }
    return "unknown";
  }

  private async discoverLogFiles(): Promise<string[]> {
    const candidates = [
      "logs",
      ".next/server",
      "dist",
      "tmp",
    ];

    const logFiles: string[] = [];

    for (const dir of candidates) {
      const fullPath = join(this.projectRoot, dir);
      try {
        const dirStat = await stat(fullPath);
        if (!dirStat.isDirectory()) continue;

        const files = await readdir(fullPath);
        for (const file of files) {
          if (file.endsWith(".log") || file.endsWith(".json")) {
            logFiles.push(join(fullPath, file));
          }
        }
      } catch {
        // directory doesn't exist
      }
    }

    return logFiles;
  }

  private async discoverConfigFiles(): Promise<string[]> {
    const candidates = [
      "package.json",
      "tsconfig.json",
      "next.config.js",
      "next.config.mjs",
      "nest-cli.json",
      ".env",
      ".env.local",
      "vite.config.ts",
      "webpack.config.js",
    ];

    const found: string[] = [];
    for (const file of candidates) {
      try {
        await stat(join(this.projectRoot, file));
        found.push(file);
      } catch {
        // doesn't exist
      }
    }
    return found;
  }

  private trimBuffer(key: keyof LogBuffer): void {
    const arr = this.buffer[key] as unknown[];
    if (arr.length > MAX_BUFFER_SIZE) {
      (this.buffer[key] as unknown[]) = arr.slice(-MAX_BUFFER_SIZE);
    }
  }
}
