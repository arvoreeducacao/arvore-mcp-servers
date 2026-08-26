import { describe, expect, it, vi } from "vitest";
import { PlayConsoleClient } from "./client.js";
import { PlayConsoleMCPTools, shapeIssue, shapeReview, shapeRow } from "./tools.js";
import { ErrorIssuesSearchParamsSchema, RateQueryParamsSchema } from "./types.js";

const NOW = Date.UTC(2026, 7, 26, 16, 45, 12);

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

describe("shapeIssue", () => {
  it("compacts an issue into the fields a reader needs", () => {
    expect(
      shapeIssue({
        name: "apps/com.example.app/errorIssues/abc123",
        type: "CRASH",
        cause: "java.lang.NullPointerException",
        location: "android.view.SurfaceControl.checkNotReleased",
        errorReportCount: "42",
        distinctUsers: "17",
        distinctUsersPercent: { value: "0.8" },
        lastErrorReportTime: "2026-08-26T10:00:00Z",
        firstOsVersion: { apiLevel: "33" },
        lastOsVersion: { apiLevel: "33" },
        firstAppVersion: { versionCode: "300" },
        lastAppVersion: { versionCode: "312" },
        issueUri: "https://play.google.com/console/x",
        sampleErrorReports: [
          {
            name: "apps/com.example.app/errorReports/r1",
            type: "CRASH",
            issue: "apps/com.example.app/errorIssues/abc123",
            reportText: "Exception ...",
            deviceModel: { marketName: "Galaxy A14", deviceId: { buildBrand: "samsung", buildDevice: "a14" } },
            osVersion: { apiLevel: "33" },
            appVersion: { versionCode: "312" },
          },
        ],
      })
    ).toEqual({
      id: "abc123",
      type: "CRASH",
      cause: "java.lang.NullPointerException",
      location: "android.view.SurfaceControl.checkNotReleased",
      reports: 42,
      users: 17,
      usersPercent: "0.8",
      lastSeen: "2026-08-26T10:00:00Z",
      apiLevels: "33-33",
      versionCodes: "300-312",
      consoleUrl: "https://play.google.com/console/x",
      annotations: undefined,
      sampleReports: [
        {
          id: "r1",
          issueId: "abc123",
          type: "CRASH",
          eventTime: undefined,
          device: "Galaxy A14 (samsung a14)",
          apiLevel: "33",
          versionCode: "312",
          stackTrace: "Exception ...",
        },
      ],
    });
  });
});

describe("shapeRow", () => {
  it("merges date, dimensions and metrics into one flat object", () => {
    expect(
      shapeRow({
        startTime: { year: 2026, month: 8, day: 25 },
        dimensions: [{ dimension: "apiLevel", int64Value: "33", valueLabel: "Android 13" }],
        metrics: [{ metric: "crashRate", decimalValue: { value: "0.0123" } }],
      })
    ).toEqual({ date: "2026-08-25", apiLevel: "Android 13", crashRate: 0.0123 });
  });
});

describe("shapeReview", () => {
  it("picks the user and developer comments", () => {
    expect(
      shapeReview({
        reviewId: "rv",
        authorName: "Ana",
        comments: [
          { userComment: { text: "Trava", starRating: 1, lastModified: { seconds: "1700000000" }, appVersionName: "3.1.0" } },
          { developerComment: { text: "Corrigido" } },
        ],
      })
    ).toMatchObject({ reviewId: "rv", author: "Ana", stars: 1, text: "Trava", appVersion: "3.1.0", developerReply: "Corrigido" });
  });
});

describe("PlayConsoleMCPTools", () => {
  it("builds the issue search from params and returns shaped issues", async () => {
    const client = {
      resolvePackage: (p?: string) => p || "com.example.app",
      searchErrorIssues: vi.fn(async () => ({
        errorIssues: [{ name: "apps/com.example.app/errorIssues/i1", errorReportCount: "3" }],
        nextPageToken: "next",
      })),
    } as unknown as PlayConsoleClient;
    const tools = new PlayConsoleMCPTools(client, () => NOW);
    const result = parse(
      await tools.searchIssues(ErrorIssuesSearchParamsSchema.parse({ type: "ANR", filter: "apiLevel = 33", sampleReports: 1 }))
    );
    expect(result.packageName).toBe("com.example.app");
    expect(result.interval).toEqual({ from: "2026-08-19T16:00", to: "2026-08-26T16:00", timeZone: "UTC" });
    expect(result.issues[0]).toMatchObject({ id: "i1", reports: 3 });
    expect(result.nextPageToken).toBe("next");
    const options = (client.searchErrorIssues as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.filter).toBe("errorIssueType = ANR AND apiLevel = 33");
    expect(options.sampleErrorReportLimit).toBe(1);
  });

  it("queries crash rate ending at the freshness date with user-perceived metrics", async () => {
    const client = {
      resolvePackage: () => "com.example.app",
      getMetricSet: vi.fn(async () => ({
        name: "x",
        freshnessInfo: {
          freshnesses: [{ aggregationPeriod: "DAILY", latestEndTime: { year: 2026, month: 8, day: 24 } }],
        },
      })),
      queryMetricSet: vi.fn(async () => ({ rows: [] })),
    } as unknown as PlayConsoleClient;
    const tools = new PlayConsoleMCPTools(client, () => NOW);
    const result = parse(
      await tools.queryCrashRate(RateQueryParamsSchema.parse({ days: 2, userPerceived: true, dimensions: ["versionCode"] }))
    );
    expect(result.timeline).toEqual({ from: "2026-08-22", to: "2026-08-24", timeZone: "America/Los_Angeles", aggregation: "DAILY" });
    const body = (client.queryMetricSet as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(body.metrics).toEqual([
      "userPerceivedCrashRate",
      "userPerceivedCrashRate7dUserWeighted",
      "userPerceivedCrashRate28dUserWeighted",
      "distinctUsers",
    ]);
    expect(body.dimensions).toEqual(["versionCode"]);
  });

  it("returns an error result instead of throwing", async () => {
    const client = {
      resolvePackage: () => "com.example.app",
      searchApps: vi.fn(async () => {
        throw new Error("boom");
      }),
    } as unknown as PlayConsoleClient;
    const tools = new PlayConsoleMCPTools(client);
    const result = await tools.listApps();
    expect(result.isError).toBe(true);
    expect(parse(result).error).toBe("boom");
  });
});
