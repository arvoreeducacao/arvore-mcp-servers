import { describe, it, expect } from "vitest";
import { ageInDays, stalenessPenalty, isStale } from "./store.js";

function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().split("T")[0];
}

describe("staleness", () => {
  describe("ageInDays", () => {
    it("returns 0 for invalid date", () => {
      expect(ageInDays("not-a-date")).toBe(0);
    });

    it("computes approximate age", () => {
      const age = ageInDays(daysAgo(100));
      expect(age).toBeGreaterThan(99);
      expect(age).toBeLessThan(101);
    });
  });

  describe("stalenessPenalty", () => {
    it("is zero for fresh memories", () => {
      expect(stalenessPenalty(daysAgo(10))).toBe(0);
      expect(stalenessPenalty(daysAgo(179))).toBe(0);
    });

    it("grows after the stale threshold", () => {
      const p = stalenessPenalty(daysAgo(270));
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(0.15);
    });

    it("is capped at the max penalty", () => {
      expect(stalenessPenalty(daysAgo(2000))).toBe(0.15);
    });
  });

  describe("isStale", () => {
    it("flags memories older than the threshold", () => {
      expect(isStale(daysAgo(200))).toBe(true);
      expect(isStale(daysAgo(100))).toBe(false);
    });
  });
});
