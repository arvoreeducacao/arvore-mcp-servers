import { DateParts, Interval, MetricSetFreshness, TimelineSpec } from "./types.js";

export const METRIC_SET_TIME_ZONE = "America/Los_Angeles";
const UTC = "UTC";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function utcParts(date: Date, withHours: boolean, timeZone: string): DateParts {
  const parts: DateParts = {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    timeZone: { id: timeZone },
  };
  if (withHours) parts.hours = date.getUTCHours();
  return parts;
}

function dateFromParts(parts: DateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours ?? 0));
}

export function hourlyUtcInterval(days: number, nowMs: number): Interval {
  const end = new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  return {
    startTime: utcParts(start, true, UTC),
    endTime: utcParts(end, true, UTC),
  };
}

export function dailyTimeline(
  days: number,
  nowMs: number,
  freshnesses: MetricSetFreshness[] = []
): TimelineSpec {
  const daily = freshnesses.find((f) => f.aggregationPeriod === "DAILY");
  const end = daily
    ? dateFromParts({ ...daily.latestEndTime, hours: 0 })
    : new Date(Math.floor(nowMs / DAY_MS) * DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  return {
    aggregationPeriod: "DAILY",
    startTime: utcParts(start, false, METRIC_SET_TIME_ZONE),
    endTime: utcParts(end, false, METRIC_SET_TIME_ZONE),
  };
}

export function formatDate(parts: DateParts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  return parts.hours === undefined ? base : `${base}T${pad(parts.hours)}:00`;
}

export function flattenQuery(
  value: unknown,
  prefix = "",
  into: Record<string, string> = {}
): Record<string, string> {
  if (value === undefined || value === null) return into;
  if (typeof value !== "object" || Array.isArray(value)) {
    into[prefix] = String(value);
    return into;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    flattenQuery(nested, prefix ? `${prefix}.${key}` : key, into);
  }
  return into;
}
