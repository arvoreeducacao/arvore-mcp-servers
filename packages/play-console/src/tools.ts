import { MetricsQueryBody, PlayConsoleClient } from "./client.js";
import { dailyTimeline, formatDate, hourlyUtcInterval } from "./intervals.js";
import {
  DimensionValue,
  ErrorCountsQueryParams,
  ErrorIssue,
  ErrorIssuesSearchParams,
  ErrorReport,
  ErrorReportsSearchParams,
  MetricSetName,
  MetricValue,
  MetricsRow,
  PlayConsoleMCPError,
  RateQueryParams,
  Review,
  ReviewsListParams,
} from "./types.js";

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

function textResult(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof PlayConsoleMCPError ? error.details : undefined;
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message, details }, null, 2) }],
    isError: true,
  };
}

function lastSegment(name?: string): string | undefined {
  return name?.split("/").pop();
}

function joinFilters(...parts: (string | undefined)[]): string | undefined {
  const present = parts.filter((p): p is string => Boolean(p && p.trim()));
  return present.length ? present.join(" AND ") : undefined;
}

function deviceLabel(report: ErrorReport): string | undefined {
  const device = report.deviceModel;
  if (!device) return undefined;
  const id = device.deviceId;
  const build = [id?.buildBrand, id?.buildDevice].filter(Boolean).join(" ");
  return device.marketName ? `${device.marketName} (${build})` : build || undefined;
}

export function shapeReport(report: ErrorReport) {
  return {
    id: lastSegment(report.name),
    issueId: lastSegment(report.issue),
    type: report.type,
    eventTime: report.eventTime,
    device: deviceLabel(report),
    apiLevel: report.osVersion?.apiLevel,
    versionCode: report.appVersion?.versionCode,
    stackTrace: report.reportText,
  };
}

export function shapeIssue(issue: ErrorIssue) {
  return {
    id: lastSegment(issue.name),
    type: issue.type,
    cause: issue.cause,
    location: issue.location,
    reports: Number(issue.errorReportCount ?? 0),
    users: Number(issue.distinctUsers ?? 0),
    usersPercent: issue.distinctUsersPercent?.value,
    lastSeen: issue.lastErrorReportTime,
    apiLevels: `${issue.firstOsVersion?.apiLevel ?? "?"}-${issue.lastOsVersion?.apiLevel ?? "?"}`,
    versionCodes: `${issue.firstAppVersion?.versionCode ?? "?"}-${issue.lastAppVersion?.versionCode ?? "?"}`,
    consoleUrl: issue.issueUri,
    annotations: issue.annotations?.map((a) => a.title).filter(Boolean),
    sampleReports: issue.sampleErrorReports?.map(shapeReport),
  };
}

function dimensionValue(dimension: DimensionValue): string | undefined {
  return dimension.valueLabel ?? dimension.stringValue ?? dimension.int64Value;
}

function metricValue(metric: MetricValue): number | undefined {
  const raw = metric.decimalValue?.value;
  return raw === undefined ? undefined : Number(raw);
}

export function shapeRow(row: MetricsRow) {
  const dimensions: Record<string, string | undefined> = {};
  for (const d of row.dimensions || []) dimensions[d.dimension] = dimensionValue(d);
  const metrics: Record<string, number | undefined> = {};
  for (const m of row.metrics || []) metrics[m.metric] = metricValue(m);
  return { date: formatDate(row.startTime), ...dimensions, ...metrics };
}

export function shapeReview(review: Review) {
  const user = review.comments?.find((c) => c.userComment)?.userComment;
  const developer = review.comments?.find((c) => c.developerComment)?.developerComment;
  const toIso = (seconds?: string) =>
    seconds ? new Date(Number(seconds) * 1000).toISOString() : undefined;
  return {
    reviewId: review.reviewId,
    author: review.authorName,
    stars: user?.starRating,
    text: user?.text,
    language: user?.reviewerLanguage,
    device: user?.device,
    androidVersion: user?.androidOsVersion,
    appVersion: user?.appVersionName ?? user?.appVersionCode,
    lastModified: toIso(user?.lastModified?.seconds),
    developerReply: developer?.text,
  };
}

export class PlayConsoleMCPTools {
  constructor(
    private readonly client: PlayConsoleClient,
    private readonly now: () => number = () => Date.now()
  ) {}

  async listApps(): Promise<ToolResult> {
    try {
      const response = await this.client.searchApps();
      return textResult({
        configuredPackages: this.client.knownPackages,
        accessibleApps: (response.apps || []).map((app) => ({
          packageName: app.packageName ?? lastSegment(app.name),
          displayName: app.displayName,
        })),
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async searchIssues(params: ErrorIssuesSearchParams): Promise<ToolResult> {
    try {
      const packageName = this.client.resolvePackage(params.packageName);
      const interval = hourlyUtcInterval(params.days, this.now());
      const response = await this.client.searchErrorIssues(packageName, {
        interval,
        filter: joinFilters(
          params.type ? `errorIssueType = ${params.type}` : undefined,
          params.filter
        ),
        orderBy: params.orderBy,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
        sampleErrorReportLimit: params.sampleReports || undefined,
      });
      return textResult({
        packageName,
        interval: { from: formatDate(interval.startTime), to: formatDate(interval.endTime), timeZone: "UTC" },
        issues: (response.errorIssues || []).map(shapeIssue),
        nextPageToken: response.nextPageToken,
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async searchReports(params: ErrorReportsSearchParams): Promise<ToolResult> {
    try {
      const packageName = this.client.resolvePackage(params.packageName);
      const interval = hourlyUtcInterval(params.days, this.now());
      const response = await this.client.searchErrorReports(packageName, {
        interval,
        filter: joinFilters(
          params.issueId ? `errorIssueId = ${params.issueId}` : undefined,
          params.type ? `errorIssueType = ${params.type}` : undefined,
          params.filter
        ),
        pageSize: params.pageSize,
        pageToken: params.pageToken,
      });
      return textResult({
        packageName,
        interval: { from: formatDate(interval.startTime), to: formatDate(interval.endTime), timeZone: "UTC" },
        reports: (response.errorReports || []).map(shapeReport),
        nextPageToken: response.nextPageToken,
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async queryErrorCounts(params: ErrorCountsQueryParams): Promise<ToolResult> {
    return this.queryMetricSet("errorCountMetricSet", params, params.dimensions, [
      "errorReportCount",
      "distinctUsers",
    ]);
  }

  async queryCrashRate(params: RateQueryParams): Promise<ToolResult> {
    const prefix = params.userPerceived ? "userPerceivedCrashRate" : "crashRate";
    return this.queryMetricSet("crashRateMetricSet", params, params.dimensions, [
      prefix,
      `${prefix}7dUserWeighted`,
      `${prefix}28dUserWeighted`,
      "distinctUsers",
    ]);
  }

  async queryAnrRate(params: RateQueryParams): Promise<ToolResult> {
    const prefix = params.userPerceived ? "userPerceivedAnrRate" : "anrRate";
    return this.queryMetricSet("anrRateMetricSet", params, params.dimensions, [
      prefix,
      `${prefix}7dUserWeighted`,
      `${prefix}28dUserWeighted`,
      "distinctUsers",
    ]);
  }

  private async queryMetricSet(
    metricSet: MetricSetName,
    params: { packageName?: string; days: number; filter?: string; pageSize: number; pageToken?: string },
    dimensions: string[],
    metrics: string[]
  ): Promise<ToolResult> {
    try {
      const packageName = this.client.resolvePackage(params.packageName);
      const metadata = await this.client.getMetricSet(packageName, metricSet);
      const timelineSpec = dailyTimeline(
        params.days,
        this.now(),
        metadata.freshnessInfo?.freshnesses
      );
      const body: MetricsQueryBody = {
        timelineSpec,
        dimensions,
        metrics,
        filter: params.filter,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
      };
      const response = await this.client.queryMetricSet(packageName, metricSet, body);
      return textResult({
        packageName,
        metricSet,
        timeline: {
          from: formatDate(timelineSpec.startTime),
          to: formatDate(timelineSpec.endTime),
          timeZone: timelineSpec.startTime.timeZone?.id,
          aggregation: timelineSpec.aggregationPeriod,
        },
        rows: (response.rows || []).map(shapeRow),
        nextPageToken: response.nextPageToken,
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  async listReviews(params: ReviewsListParams): Promise<ToolResult> {
    try {
      const packageName = this.client.resolvePackage(params.packageName);
      const response = await this.client.listReviews(packageName, {
        maxResults: params.maxResults,
        token: params.token,
        translationLanguage: params.translationLanguage,
      });
      return textResult({
        packageName,
        reviews: (response.reviews || []).map(shapeReview),
        nextPageToken: response.tokenPagination?.nextPageToken,
      });
    } catch (error) {
      return errorResult(error);
    }
  }
}
