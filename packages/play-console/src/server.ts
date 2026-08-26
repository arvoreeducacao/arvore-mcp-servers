import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PlayConsoleClient } from "./client.js";
import { PlayConsoleMCPTools } from "./tools.js";
import {
  AppsListParamsSchema,
  ErrorCountsQueryParamsSchema,
  ErrorIssuesSearchParamsSchema,
  ErrorReportsSearchParamsSchema,
  PlayConsoleClientConfig,
  RateQueryParamsSchema,
  ReviewsListParamsSchema,
} from "./types.js";

export class PlayConsoleMCPServer {
  private server: McpServer;
  private tools: PlayConsoleMCPTools;

  constructor(config: PlayConsoleClientConfig) {
    this.server = new McpServer({ name: "play-console-mcp-server", version: "1.0.0" });
    this.tools = new PlayConsoleMCPTools(new PlayConsoleClient(config));
    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "apps_list",
      {
        title: "List Apps",
        description:
          "List the Play Console apps this service account can read, plus the packages configured for this server.",
        inputSchema: AppsListParamsSchema.shape,
      },
      async () => this.tools.listApps()
    );

    this.server.registerTool(
      "vitals_issues_search",
      {
        title: "Search Crash / ANR Issues",
        description:
          "List Android vitals error issues (grouped crashes, ANRs, non-fatals) for an app in the last N days, ordered by report count or affected users. This is the 'Crashes and ANRs' list of the Play Console. Use sampleReports > 0 to embed sample stack traces.",
        inputSchema: ErrorIssuesSearchParamsSchema.shape,
      },
      async (params) => this.tools.searchIssues(ErrorIssuesSearchParamsSchema.parse(params))
    );

    this.server.registerTool(
      "vitals_reports_search",
      {
        title: "Search Error Reports",
        description:
          "List individual crash/ANR reports with full stack traces, device, OS and app version. Filter by issueId to drill into one issue from vitals_issues_search.",
        inputSchema: ErrorReportsSearchParamsSchema.shape,
      },
      async (params) => this.tools.searchReports(ErrorReportsSearchParamsSchema.parse(params))
    );

    this.server.registerTool(
      "vitals_error_counts",
      {
        title: "Error Counts",
        description:
          "Daily counts of error reports and distinct affected users, broken down by dimensions such as reportType, apiLevel, versionCode, deviceModel or issueId.",
        inputSchema: ErrorCountsQueryParamsSchema.shape,
      },
      async (params) => this.tools.queryErrorCounts(ErrorCountsQueryParamsSchema.parse(params))
    );

    this.server.registerTool(
      "vitals_crash_rate",
      {
        title: "Crash Rate",
        description:
          "Daily crash rate (share of daily active users that hit a crash), including the 7d/28d user-weighted rates that Play uses for the bad-behaviour threshold. Optional breakdown by apiLevel, versionCode, deviceModel, deviceBrand, deviceType or countryCode.",
        inputSchema: RateQueryParamsSchema.shape,
      },
      async (params) => this.tools.queryCrashRate(RateQueryParamsSchema.parse(params))
    );

    this.server.registerTool(
      "vitals_anr_rate",
      {
        title: "ANR Rate",
        description:
          "Daily ANR rate (share of daily active users that hit an ANR), including the 7d/28d user-weighted rates. Same breakdown options as vitals_crash_rate.",
        inputSchema: RateQueryParamsSchema.shape,
      },
      async (params) => this.tools.queryAnrRate(RateQueryParamsSchema.parse(params))
    );

    this.server.registerTool(
      "reviews_list",
      {
        title: "List Reviews",
        description:
          "Recent Play Store user reviews (stars, text, device, app version, developer reply). Only reviews from the last week are returned by Google.",
        inputSchema: ReviewsListParamsSchema.shape,
      },
      async (params) => this.tools.listReviews(ReviewsListParamsSchema.parse(params))
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Play Console MCP Server running on stdio");
  }

  setupGracefulShutdown(): void {
    const shutdown = async () => {
      await this.server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
