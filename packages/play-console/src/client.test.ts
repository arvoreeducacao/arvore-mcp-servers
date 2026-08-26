import { describe, expect, it, vi } from "vitest";
import { ServiceAccountAuth } from "./auth.js";
import { PlayConsoleClient } from "./client.js";

const config = {
  serviceAccount: { client_email: "bot@x", private_key: "unused" },
  packages: ["com.example.app", "com.example.other"],
};

function clientWith(fetchImpl: ReturnType<typeof vi.fn>) {
  const auth = { accessToken: async () => "tok" } as unknown as ServiceAccountAuth;
  return new PlayConsoleClient(config, fetchImpl as unknown as typeof fetch, auth);
}

describe("PlayConsoleClient", () => {
  it("resolves the default package", () => {
    const client = clientWith(vi.fn());
    expect(client.resolvePackage()).toBe("com.example.app");
    expect(client.resolvePackage("com.example.other")).toBe("com.example.other");
    expect(() => new PlayConsoleClient({ ...config, packages: [] }).resolvePackage()).toThrow(
      "PLAY_CONSOLE_PACKAGES is empty"
    );
  });

  it("flattens the interval into the errorIssues:search query with the bearer token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ errorIssues: [] }), { status: 200 }));
    const client = clientWith(fetchImpl);
    await client.searchErrorIssues("com.example.app", {
      interval: {
        startTime: { year: 2026, month: 8, day: 19, hours: 16, timeZone: { id: "UTC" } },
        endTime: { year: 2026, month: 8, day: 26, hours: 16, timeZone: { id: "UTC" } },
      },
      filter: "errorIssueType = CRASH",
      orderBy: "errorReportCount desc",
      pageSize: 25,
      sampleErrorReportLimit: 2,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v1beta1/apps/com.example.app/errorIssues:search");
    expect(url.searchParams.get("interval.startTime.day")).toBe("19");
    expect(url.searchParams.get("interval.endTime.timeZone.id")).toBe("UTC");
    expect(url.searchParams.get("filter")).toBe("errorIssueType = CRASH");
    expect(url.searchParams.get("sampleErrorReportLimit")).toBe("2");
    expect(url.searchParams.has("pageToken")).toBe(false);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("posts metric set queries as JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    const client = clientWith(fetchImpl);
    const body = {
      timelineSpec: {
        aggregationPeriod: "DAILY" as const,
        startTime: { year: 2026, month: 8, day: 1 },
        endTime: { year: 2026, month: 8, day: 8 },
      },
      dimensions: [],
      metrics: ["crashRate"],
      pageSize: 10,
    };
    await client.queryMetricSet("com.example.app", "crashRateMetricSet", body);
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v1beta1/apps/com.example.app/crashRateMetricSet:query");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("wraps API errors with status and parsed details", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "denied" } }), { status: 403 })
    );
    const client = clientWith(fetchImpl);
    await expect(client.searchApps()).rejects.toMatchObject({
      status: 403,
      details: { error: { message: "denied" } },
    });
  });
});
