import { PaginationState } from "./types.js";

const CURSOR_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class PaginationManager {
  private cursors = new Map<string, PaginationState>();

  create(state: Omit<PaginationState, "createdAt">): string {
    const key = `c:${state.provider}.${state.originalName}:p${state.page}`;
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
  }
}
