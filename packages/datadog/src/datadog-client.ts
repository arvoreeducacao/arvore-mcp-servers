import { client, v1, v2 } from "@datadog/datadog-api-client";
import {
  DatadogConfig,
  DatadogMCPError,
  MetricQueryParams,
  LogQueryParams,
  DashboardListParams,
  MonitorListParams,
  ServiceMapParams,
  InfrastructureListParams,
  TraceSearchParams,
  ServicesListParams,
  SpansMetricsParams,
} from "./types.js";

export class DatadogClient {
  private configuration: client.Configuration;
  private metricsApi: v1.MetricsApi;
  private logsApi: v2.LogsApi;
  private dashboardsApi: v1.DashboardsApi;
  private monitorsApi: v1.MonitorsApi;
  private hostsApi: v1.HostsApi;

  constructor(config: DatadogConfig) {
    this.configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: config.apiKey,
        appKeyAuth: config.appKey,
      },
    });

    this.metricsApi = new v1.MetricsApi(this.configuration);
    this.logsApi = new v2.LogsApi(this.configuration);
    this.dashboardsApi = new v1.DashboardsApi(this.configuration);
    this.monitorsApi = new v1.MonitorsApi(this.configuration);
    this.hostsApi = new v1.HostsApi(this.configuration);
  }

  async queryMetrics(params: MetricQueryParams): Promise<v1.MetricsQueryResponse> {
    try {
      const response = await this.metricsApi.queryMetrics({
        from: params.from,
        to: params.to,
        query: params.query,
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to query metrics: ${error instanceof Error ? error.message : String(error)}`,
        "METRICS_QUERY_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async searchLogs(params: LogQueryParams): Promise<v2.LogsListResponse> {
    try {
      const response = await this.logsApi.listLogs({
        body: {
          filter: {
            query: params.query,
            from: params.time.from,
            to: params.time.to,
          },
          page: {
            limit: params.limit,
          },
          sort: "timestamp",
        },
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to search logs: ${error instanceof Error ? error.message : String(error)}`,
        "LOGS_SEARCH_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async listDashboards(params: DashboardListParams): Promise<v1.DashboardSummary[]> {
    try {
      const response = await this.dashboardsApi.listDashboards({
        count: params.count,
        start: params.start,
      });
      return response.dashboards || [];
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to list dashboards: ${error instanceof Error ? error.message : String(error)}`,
        "DASHBOARDS_LIST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async listMonitors(params: MonitorListParams): Promise<v1.Monitor[]> {
    try {
      const response = await this.monitorsApi.listMonitors({
        groupStates: params.groupStates?.join(",") || undefined,
        name: params.name,
        tags: params.tags?.join(",") || undefined,
        monitorTags: params.monitorTags?.join(",") || undefined,
        withDowntimes: params.withDowntimes,
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to list monitors: ${error instanceof Error ? error.message : String(error)}`,
        "MONITORS_LIST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async getServiceMap(params: ServiceMapParams): Promise<{ message: string; env: string; timeRange: { start: number; end: number } }> {
    return {
      message: "Service map functionality requires APM setup and is not available in this implementation",
      env: params.env,
      timeRange: {
        start: params.start,
        end: params.end,
      },
    };
  }

  async listHosts(params: InfrastructureListParams): Promise<v1.HostListResponse> {
    try {
      const response = await this.hostsApi.listHosts({
        filter: params.filter,
        sortField: params.sortField,
        sortDir: params.sortDir,
        start: params.start,
        count: params.count,
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to list hosts: ${error instanceof Error ? error.message : String(error)}`,
        "HOSTS_LIST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async searchTraces(params: TraceSearchParams): Promise<any> {
    try {
      let query = `@_top_level:1`;
      if (params.query && params.query !== "*") {
        query += ` AND ${params.query}`;
      }

      const response = await this.logsApi.listLogs({
        body: {
          filter: {
            query,
            from: new Date(params.start * 1000).toISOString(),
            to: new Date(params.end * 1000).toISOString(),
          },
          page: {
            limit: params.limit,
          },
          sort: "timestamp",
        },
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to search traces: ${error instanceof Error ? error.message : String(error)}`,
        "TRACES_SEARCH_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async listServices(params: ServicesListParams): Promise<any> {
    try {
      const response = await this.metricsApi.queryMetrics({
        from: params.start,
        to: params.end,
        query: `avg:trace.service.hits{${params.env ? `env:${params.env}` : '*'}} by {service}`,
      });
      return response;
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to list services: ${error instanceof Error ? error.message : String(error)}`,
        "SERVICES_LIST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async getSpansMetrics(params: SpansMetricsParams): Promise<any> {
    try {
      const tags = [];
      if (params.service) tags.push(`service:${params.service}`);
      if (params.env) tags.push(`env:${params.env}`);
      
      const tagFilter = tags.length > 0 ? `{${tags.join(",")}}` : "";
      
      const queries = [
        `avg:trace.servlet.request.hits${tagFilter}`,
        `avg:trace.servlet.request.duration${tagFilter}`,
        `avg:trace.servlet.request.errors${tagFilter}`,
      ];

      const responses = await Promise.all(
        queries.map(query => 
          this.metricsApi.queryMetrics({
            from: params.start,
            to: params.end,
            query,
          })
        )
      );

      return {
        hits: responses[0],
        duration: responses[1],
        errors: responses[2],
        query_info: {
          service: params.service,
          operation: params.operation,
          resource: params.resource,
          env: params.env,
        }
      };
    } catch (error) {
      throw new DatadogMCPError(
        `Failed to get spans metrics: ${error instanceof Error ? error.message : String(error)}`,
        "SPANS_METRICS_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.dashboardsApi.listDashboards({ count: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
