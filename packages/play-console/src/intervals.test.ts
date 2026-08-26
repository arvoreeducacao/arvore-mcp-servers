import { describe, expect, it } from "vitest";
import { dailyTimeline, flattenQuery, formatDate, hourlyUtcInterval } from "./intervals.js";

const NOW = Date.UTC(2026, 7, 26, 16, 45, 12);

describe("hourlyUtcInterval", () => {
  it("floors the end to the hour and goes back N days in UTC", () => {
    const interval = hourlyUtcInterval(7, NOW);
    expect(interval.endTime).toEqual({ year: 2026, month: 8, day: 26, hours: 16, timeZone: { id: "UTC" } });
    expect(interval.startTime).toEqual({ year: 2026, month: 8, day: 19, hours: 16, timeZone: { id: "UTC" } });
  });
});

describe("dailyTimeline", () => {
  it("ends at the latest processed day when freshness is known", () => {
    const timeline = dailyTimeline(3, NOW, [
      { aggregationPeriod: "DAILY", latestEndTime: { year: 2026, month: 8, day: 25, timeZone: { id: "America/Los_Angeles" } } },
    ]);
    expect(timeline.aggregationPeriod).toBe("DAILY");
    expect(formatDate(timeline.startTime)).toBe("2026-08-22");
    expect(formatDate(timeline.endTime)).toBe("2026-08-25");
    expect(timeline.endTime.timeZone).toEqual({ id: "America/Los_Angeles" });
    expect(timeline.endTime.hours).toBeUndefined();
  });

  it("falls back to today when freshness is unknown", () => {
    const timeline = dailyTimeline(1, NOW);
    expect(formatDate(timeline.endTime)).toBe("2026-08-26");
    expect(formatDate(timeline.startTime)).toBe("2026-08-25");
  });
});

describe("flattenQuery", () => {
  it("dots nested objects into query keys", () => {
    expect(
      flattenQuery({ startTime: { year: 2026, timeZone: { id: "UTC" } }, endTime: undefined }, "interval")
    ).toEqual({ "interval.startTime.year": "2026", "interval.startTime.timeZone.id": "UTC" });
  });
});
