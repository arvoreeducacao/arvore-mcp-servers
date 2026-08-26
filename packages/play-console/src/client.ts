import { ServiceAccountAuth } from "./auth.js";
import { flattenQuery } from "./intervals.js";
import {
  Interval,
  MetricSetMetadata,
  MetricSetName,
  MetricsQueryResponse,
  PlayConsoleClientConfig,
  PlayConsoleMCPError,
  ReviewsListResponse,
  SearchAppsResponse,
  SearchErrorIssuesResponse,
  SearchErrorReportsResponse,
  TimelineSpec,
} from "./types.js";

const REPORTING_BASE = "https://playdeveloperreporting.googleapis.com/v1beta1";
const PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export interface ErrorSearchOptions {
  interval: Interval;
  filter?: string;
  orderBy?: string;
  pageSize: number;
  pageToken?: string;
  sampleErrorReportLimit?: number;
}

export interface MetricsQueryBody {
  timelineSpec: TimelineSpec;
  dimensions: string[];
  metrics: string[];
  filter?: string;
  pageSize: number;
  pageToken?: string;
}

export class PlayConsoleClient {
  private readonly auth: ServiceAccountAuth;

  constructor(
    private readonly config: PlayConsoleClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    auth?: ServiceAccountAuth
  ) {
    this.auth = auth ?? new ServiceAccountAuth(config.serviceAccount, fetchImpl);
  }

  get knownPackages(): string[] {
    return this.config.packages;
  }

  resolvePackage(packageName?: string): string {
    const resolved = packageName || this.config.packages[0];
    if (!resolved) {
      throw new PlayConsoleMCPError(
        "No package name given and PLAY_CONSOLE_PACKAGES is empty."
      );
    }
    return resolved;
  }

  private async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const target = new URL(url);
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
    const token = await this.auth.accessToken();
    const response = await this.fetchImpl(target, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new PlayConsoleMCPError(
        `Play API ${options.method || "GET"} ${target.pathname} failed (${response.status}): ${text}`,
        response.status,
        safeJson(text)
      );
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  searchApps(): Promise<SearchAppsResponse> {
    return this.request<SearchAppsResponse>(`${REPORTING_BASE}/apps:search`, {
      query: { pageSize: 100 },
    });
  }

  searchErrorIssues(
    packageName: string,
    options: ErrorSearchOptions
  ): Promise<SearchErrorIssuesResponse> {
    return this.request<SearchErrorIssuesResponse>(
      `${REPORTING_BASE}/apps/${packageName}/errorIssues:search`,
      {
        query: {
          ...flattenQuery(options.interval, "interval"),
          filter: options.filter,
          orderBy: options.orderBy,
          pageSize: options.pageSize,
          pageToken: options.pageToken,
          sampleErrorReportLimit: options.sampleErrorReportLimit,
        },
      }
    );
  }

  searchErrorReports(
    packageName: string,
    options: ErrorSearchOptions
  ): Promise<SearchErrorReportsResponse> {
    return this.request<SearchErrorReportsResponse>(
      `${REPORTING_BASE}/apps/${packageName}/errorReports:search`,
      {
        query: {
          ...flattenQuery(options.interval, "interval"),
          filter: options.filter,
          pageSize: options.pageSize,
          pageToken: options.pageToken,
        },
      }
    );
  }

  getMetricSet(packageName: string, metricSet: MetricSetName): Promise<MetricSetMetadata> {
    return this.request<MetricSetMetadata>(
      `${REPORTING_BASE}/apps/${packageName}/${metricSet}`
    );
  }

  queryMetricSet(
    packageName: string,
    metricSet: MetricSetName,
    body: MetricsQueryBody
  ): Promise<MetricsQueryResponse> {
    return this.request<MetricsQueryResponse>(
      `${REPORTING_BASE}/apps/${packageName}/${metricSet}:query`,
      { method: "POST", body }
    );
  }

  listReviews(
    packageName: string,
    options: { maxResults: number; token?: string; translationLanguage?: string }
  ): Promise<ReviewsListResponse> {
    return this.request<ReviewsListResponse>(
      `${PUBLISHER_BASE}/applications/${packageName}/reviews`,
      { query: options }
    );
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
