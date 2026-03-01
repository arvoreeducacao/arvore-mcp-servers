import { AuditEntry } from "./types.js";

export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries = 1000;

  log(entry: AuditEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    console.error(
      `[audit] ${entry.tool} via ${entry.provider} | ${entry.executionTimeMs}ms | ${entry.outputSize}b` +
        (entry.error ? ` | ERROR: ${entry.error}` : "")
    );
  }

  getEntries(limit = 50): AuditEntry[] {
    return this.entries.slice(-limit);
  }

  createEntry(
    partial: Pick<AuditEntry, "tool" | "provider" | "args">
  ): AuditEntry & { _start: number } {
    return {
      ...partial,
      timestamp: new Date().toISOString(),
      outputSize: 0,
      executionTimeMs: 0,
      _start: Date.now(),
    };
  }

  finalize(
    entry: AuditEntry & { _start: number },
    result: { outputSize: number; itemCount?: number; error?: string }
  ): void {
    entry.executionTimeMs = Date.now() - entry._start;
    entry.outputSize = result.outputSize;
    entry.itemCount = result.itemCount;
    entry.error = result.error;
    this.log(entry);
  }
}
