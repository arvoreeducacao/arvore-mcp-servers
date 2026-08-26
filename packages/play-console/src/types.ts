import { z } from "zod";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface PlayConsoleClientConfig {
  serviceAccount: ServiceAccountKey;
  packages: string[];
}

export class PlayConsoleMCPError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "PlayConsoleMCPError";
  }
}

export type ErrorType = "CRASH" | "ANR" | "NON_FATAL";

export type MetricSetName =
  | "crashRateMetricSet"
  | "anrRateMetricSet"
  | "errorCountMetricSet";

export interface DateParts {
  year: number;
  month: number;
  day: number;
  hours?: number;
  timeZone?: { id: string };
}

export interface Interval {
  startTime: DateParts;
  endTime: DateParts;
}

export interface TimelineSpec {
  aggregationPeriod: "DAILY" | "HOURLY";
  startTime: DateParts;
  endTime: DateParts;
}

export interface MetricSetFreshness {
  aggregationPeriod: "DAILY" | "HOURLY";
  latestEndTime: DateParts;
}

export interface MetricSetMetadata {
  name: string;
  freshnessInfo?: { freshnesses?: MetricSetFreshness[] };
}

export interface DimensionValue {
  dimension: string;
  stringValue?: string;
  int64Value?: string;
  valueLabel?: string;
}

export interface MetricValue {
  metric: string;
  decimalValue?: { value: string };
  decimalValueConfidenceInterval?: {
    lowerBound?: { value: string };
    upperBound?: { value: string };
  };
}

export interface MetricsRow {
  startTime: DateParts;
  dimensions?: DimensionValue[];
  metrics?: MetricValue[];
}

export interface MetricsQueryResponse {
  rows?: MetricsRow[];
  nextPageToken?: string;
}

export interface OsVersion {
  apiLevel?: string;
}

export interface AppVersion {
  versionCode?: string;
}

export interface DeviceModelSummary {
  deviceId?: { buildBrand?: string; buildDevice?: string };
  marketName?: string;
  deviceUri?: string;
}

export interface ErrorReport {
  name: string;
  type?: ErrorType;
  reportText?: string;
  issue?: string;
  eventTime?: string;
  deviceModel?: DeviceModelSummary;
  osVersion?: OsVersion;
  appVersion?: AppVersion;
  vcsInformation?: { versionControlSystemInfo?: string };
}

export interface ErrorIssue {
  name: string;
  type?: ErrorType;
  cause?: string;
  location?: string;
  errorReportCount?: string;
  distinctUsers?: string;
  distinctUsersPercent?: { value: string };
  lastErrorReportTime?: string;
  firstOsVersion?: OsVersion;
  lastOsVersion?: OsVersion;
  firstAppVersion?: AppVersion;
  lastAppVersion?: AppVersion;
  issueUri?: string;
  sampleErrorReports?: ErrorReport[];
  annotations?: { category?: string; title?: string; body?: string }[];
}

export interface SearchErrorIssuesResponse {
  errorIssues?: ErrorIssue[];
  nextPageToken?: string;
}

export interface SearchErrorReportsResponse {
  errorReports?: ErrorReport[];
  nextPageToken?: string;
}

export interface App {
  name: string;
  packageName?: string;
  displayName?: string;
}

export interface SearchAppsResponse {
  apps?: App[];
  nextPageToken?: string;
}

export interface Review {
  reviewId: string;
  authorName?: string;
  comments?: {
    userComment?: {
      text?: string;
      lastModified?: { seconds?: string };
      starRating?: number;
      reviewerLanguage?: string;
      device?: string;
      androidOsVersion?: number;
      appVersionCode?: number;
      appVersionName?: string;
      thumbsUpCount?: number;
      thumbsDownCount?: number;
    };
    developerComment?: { text?: string; lastModified?: { seconds?: string } };
  }[];
}

export interface ReviewsListResponse {
  reviews?: Review[];
  tokenPagination?: { nextPageToken?: string };
}

const packageName = z
  .string()
  .optional()
  .describe(
    "Android package name (e.g. arvoredelivros.com.br.arvore or br.com.arvore.biblion). Defaults to the first of PLAY_CONSOLE_PACKAGES."
  );

const days = z
  .number()
  .int()
  .min(1)
  .max(90)
  .default(7)
  .describe("Lookback window in days ending now (max 90)");

const errorType = z
  .enum(["CRASH", "ANR", "NON_FATAL"])
  .optional()
  .describe("Restrict to one error type");

const extraFilter = z
  .string()
  .optional()
  .describe(
    'Extra AIP-160 filter ANDed to the rest, e.g. "apiLevel = 33", "versionCode = 1234", "deviceBrand = \\"samsung\\"", "isUserPerceived = true"'
  );

const rateDimensions = z
  .array(
    z.enum([
      "apiLevel",
      "versionCode",
      "deviceModel",
      "deviceBrand",
      "deviceType",
      "countryCode",
    ])
  )
  .default([])
  .describe("Dimensions to break the series down by (empty = one row per day)");

export const AppsListParamsSchema = z.object({});

export const ErrorIssuesSearchParamsSchema = z.object({
  packageName,
  days,
  type: errorType,
  filter: extraFilter,
  orderBy: z
    .enum(["errorReportCount desc", "distinctUsers desc"])
    .default("errorReportCount desc"),
  pageSize: z.number().int().min(1).max(100).default(25),
  pageToken: z.string().optional(),
  sampleReports: z
    .number()
    .int()
    .min(0)
    .max(5)
    .default(0)
    .describe("How many sample stack traces to embed per issue (0 = none)"),
});

export const ErrorReportsSearchParamsSchema = z.object({
  packageName,
  days,
  issueId: z
    .string()
    .optional()
    .describe("Only reports of this issue (id returned by vitals_issues_search)"),
  type: errorType,
  filter: extraFilter,
  pageSize: z.number().int().min(1).max(100).default(10),
  pageToken: z.string().optional(),
});

export const ErrorCountsQueryParamsSchema = z.object({
  packageName,
  days,
  dimensions: z
    .array(
      z.enum([
        "reportType",
        "isUserPerceived",
        "issueId",
        "apiLevel",
        "versionCode",
        "deviceModel",
        "deviceBrand",
        "deviceType",
        "countryCode",
      ])
    )
    .default(["reportType"])
    .describe("Dimensions to break the counts down by"),
  filter: extraFilter,
  pageSize: z.number().int().min(1).max(1000).default(100),
  pageToken: z.string().optional(),
});

export const RateQueryParamsSchema = z.object({
  packageName,
  days,
  dimensions: rateDimensions,
  userPerceived: z
    .boolean()
    .default(false)
    .describe("Use the user-perceived rate (what the Play Console dashboard shows) instead of the raw rate"),
  filter: extraFilter,
  pageSize: z.number().int().min(1).max(1000).default(100),
  pageToken: z.string().optional(),
});

export const ReviewsListParamsSchema = z.object({
  packageName,
  maxResults: z.number().int().min(1).max(100).default(20),
  token: z.string().optional().describe("Pagination token from a previous call"),
  translationLanguage: z
    .string()
    .optional()
    .describe("BCP-47 language to translate reviews into, e.g. pt-BR"),
});

export type AppsListParams = z.infer<typeof AppsListParamsSchema>;
export type ErrorIssuesSearchParams = z.infer<typeof ErrorIssuesSearchParamsSchema>;
export type ErrorReportsSearchParams = z.infer<typeof ErrorReportsSearchParamsSchema>;
export type ErrorCountsQueryParams = z.infer<typeof ErrorCountsQueryParamsSchema>;
export type RateQueryParams = z.infer<typeof RateQueryParamsSchema>;
export type ReviewsListParams = z.infer<typeof ReviewsListParamsSchema>;
