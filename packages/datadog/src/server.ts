import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DatadogClient } from "./datadog-client.js";
import { DatadogMCPTools } from "./tools.js";
import {
  DatadogConfig,
  DatadogConfigSchema,
  MetricQueryParams,
  LogQueryParams,
  DashboardListParams,
  MonitorListParams,
  ServiceMapParams,
  InfrastructureListParams,
  MetricQueryParamsSchema,
  LogQueryParamsSchema,
  DashboardListParamsSchema,
  MonitorListParamsSchema,
  ServiceMapParamsSchema,
  InfrastructureListParamsSchema,
  TraceSearchParamsSchema,
  ServicesListParamsSchema,
  SpansMetricsParamsSchema,
  DatadogMCPError,
} from "./types.js";

export class DatadogMCPServer {
  private server: McpServer;
  private client: DatadogClient;
  private tools: DatadogMCPTools;

  constructor(config: DatadogConfig) {
    this.server = new McpServer({
      name: "datadog-mcp-server",
      version: "1.0.0",
    });

    this.client = new DatadogClient(config);
    this.tools = new DatadogMCPTools(this.client);

    this.setupTools();
  }

  static fromEnvironment(): DatadogMCPServer {
    const config = DatadogConfigSchema.parse({
      apiKey: process.env.DATADOG_API_KEY || "",
      appKey: process.env.DATADOG_APP_KEY || "",
      site: process.env.DATADOG_SITE || "datadoghq.com",
    });

    return new DatadogMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "query_metrics",
      {
        title: "Query Datadog Metrics",
        description: "Execute a metrics query to retrieve time series data from Datadog",
        inputSchema: {
          query: MetricQueryParamsSchema.shape.query,
          from: MetricQueryParamsSchema.shape.from,
          to: MetricQueryParamsSchema.shape.to,
        },
      },
      async (params) => {
        return this.tools.queryMetrics(params as MetricQueryParams);
      }
    );

    this.server.registerTool(
      "search_logs",
      {
        title: "Search Datadog Logs",
        description: "Search and retrieve logs from Datadog based on query criteria",
        inputSchema: {
          query: LogQueryParamsSchema.shape.query,
          time: LogQueryParamsSchema.shape.time,
          limit: LogQueryParamsSchema.shape.limit,
        },
      },
      async (params) => {
        return this.tools.searchLogs(params as LogQueryParams);
      }
    );

    this.server.registerTool(
      "list_dashboards",
      {
        title: "List Datadog Dashboards",
        description: "Retrieve a list of dashboards from your Datadog account",
        inputSchema: {
          count: DashboardListParamsSchema.shape.count,
          start: DashboardListParamsSchema.shape.start,
        },
      },
      async (params) => {
        return this.tools.listDashboards(params as DashboardListParams);
      }
    );

    this.server.registerTool(
      "list_monitors",
      {
        title: "List Datadog Monitors",
        description: "Retrieve a list of monitors from your Datadog account",
        inputSchema: {
          groupStates: MonitorListParamsSchema.shape.groupStates,
          name: MonitorListParamsSchema.shape.name,
          tags: MonitorListParamsSchema.shape.tags,
          monitorTags: MonitorListParamsSchema.shape.monitorTags,
          withDowntimes: MonitorListParamsSchema.shape.withDowntimes,
        },
      },
      async (params) => {
        return this.tools.listMonitors(params as MonitorListParams);
      }
    );

    this.server.registerTool(
      "get_service_map",
      {
        title: "Get Datadog Service Map",
        description: "Retrieve service map data for APM services",
        inputSchema: {
          env: ServiceMapParamsSchema.shape.env,
          start: ServiceMapParamsSchema.shape.start,
          end: ServiceMapParamsSchema.shape.end,
        },
      },
      async (params) => {
        return this.tools.getServiceMap(params as ServiceMapParams);
      }
    );

    this.server.registerTool(
      "list_hosts",
      {
        title: "List Infrastructure Hosts",
        description: "Retrieve a list of hosts from your Datadog infrastructure monitoring",
        inputSchema: {
          filter: InfrastructureListParamsSchema.shape.filter,
          sortField: InfrastructureListParamsSchema.shape.sortField,
          sortDir: InfrastructureListParamsSchema.shape.sortDir,
          start: InfrastructureListParamsSchema.shape.start,
          count: InfrastructureListParamsSchema.shape.count,
        },
      },
      async (params) => {
        return this.tools.listHosts(params as InfrastructureListParams);
      }
    );

    this.server.registerTool(
      "get_active_metrics",
      {
        title: "Get Active Metrics",
        description: "Retrieve a list of actively reporting metrics from the last hour",
        inputSchema: {},
      },
      async () => {
        return this.tools.getActiveMetrics();
      }
    );

    this.server.registerTool(
      "search_traces",
      {
        title: "Search APM Traces",
        description: "Search for traces in Datadog APM with filtering capabilities",
        inputSchema: {
          query: TraceSearchParamsSchema.shape.query,
          start: TraceSearchParamsSchema.shape.start,
          end: TraceSearchParamsSchema.shape.end,
          limit: TraceSearchParamsSchema.shape.limit,
        },
      },
      async (params) => {
        return this.tools.searchTraces(params as any);
      }
    );

    this.server.registerTool(
      "list_services",
      {
        title: "List APM Services",
        description: "List services monitored by Datadog APM",
        inputSchema: {
          start: ServicesListParamsSchema.shape.start,
          end: ServicesListParamsSchema.shape.end,
          env: ServicesListParamsSchema.shape.env,
        },
      },
      async (params) => {
        return this.tools.listServices(params as any);
      }
    );

    this.server.registerTool(
      "get_spans_metrics",
      {
        title: "Get Spans Metrics",
        description: "Get metrics for spans with optional filtering by service, operation, resource, or environment",
        inputSchema: {
          start: SpansMetricsParamsSchema.shape.start,
          end: SpansMetricsParamsSchema.shape.end,
          service: SpansMetricsParamsSchema.shape.service,
          operation: SpansMetricsParamsSchema.shape.operation,
          resource: SpansMetricsParamsSchema.shape.resource,
          env: SpansMetricsParamsSchema.shape.env,
        },
      },
      async (params) => {
        return this.tools.getSpansMetrics(params as any);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const isConnected = await this.client.testConnection();
      if (!isConnected) {
        throw new DatadogMCPError(
          "Datadog API connection test failed. Please check your API and App keys.",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Datadog MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Datadog MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
