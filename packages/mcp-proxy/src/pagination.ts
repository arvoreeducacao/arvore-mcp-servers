import { createHash } from "node:crypto";
import { PaginationState } from "./types.js";

const CURSOR_TTL_MS = 5 * 60 * 1000;
const MAX_CURSORS = 200;

export class PaginationManager {
  private readonly cursors = new Map<string, PaginationState>();

  create(state: Omit<PaginationState, "createdAt">): string {
    const argsHash = createHash("md5")
      .update(JSON.stringify(state.args))
      .digest("hex")
      .slice(0, 8);
    const key = `c:${state.provider}.${state.originalName}:${argsHash}:p${state.page}`;
    this.cursors.set(key, { ...state, createdAt: Date.now() });
    this.cleanup();
    return key;
  }

  resolve(key: string): PaginationState | undefined {
    const state = this.cursors.get(key);
    if (!state) return undefined;
    if (Date.now() - state.createdAt > CURSOR_TTL_MS) {
      this.cursors.delete(key);
      return undefined;
    }
    return state;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, state] of this.cursors) {
      if (now - state.createdAt > CURSOR_TTL_MS) {
        this.cursors.delete(key);
      }
    }
    while (this.cursors.size > MAX_CURSORS) {
      const oldest = this.cursors.keys().next().value;
      if (oldest) this.cursors.delete(oldest);
      else break;
    }
  }
}
