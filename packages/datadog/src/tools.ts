import { DatadogClient } from "./datadog-client.js";
import {
  MetricQueryParams,
  LogQueryParams,
  DashboardListParams,
  MonitorListParams,
  ServiceMapParams,
  InfrastructureListParams,
  TraceSearchParams,
  ServicesListParams,
  SpansMetricsParams,
  McpToolResult,
} from "./types.js";

export class DatadogMCPTools {
  constructor(private client: DatadogClient) {}

  async queryMetrics(params: MetricQueryParams): Promise<McpToolResult> {
    const result = await this.client.queryMetrics(params);
    
    const formattedResult = {
      status: result.status,
      series: result.series?.map(series => ({
        metric: series.metric,
        displayName: series.displayName,
        unit: series.unit,
        pointlist: series.pointlist,
        length: series.length,
      })),
      fromDate: result.fromDate,
      toDate: result.toDate,
      query: result.query,
      message: result.message,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async searchLogs(params: LogQueryParams): Promise<McpToolResult> {
    const result = await this.client.searchLogs(params);
    
    const formattedResult = {
      data: result.data?.map(log => ({
        id: log.id,
        type: log.type,
        attributes: {
          timestamp: log.attributes?.timestamp,
          host: log.attributes?.host,
          service: log.attributes?.service,
          // source: log.attributes?.source,
          message: log.attributes?.message,
          status: log.attributes?.status,
          tags: log.attributes?.tags,
        }
      })),
      meta: result.meta,
      links: result.links,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async listDashboards(params: DashboardListParams): Promise<McpToolResult> {
    const result = await this.client.listDashboards(params);
    
    const formattedResult = result.map((dashboard) => ({
      id: (dashboard as any).id || 'unknown',
      title: (dashboard as any).title || 'Untitled Dashboard',
      description: (dashboard as any).description || '',
      authorHandle: (dashboard as any).authorHandle || 'unknown',
      createdAt: (dashboard as any).createdAt || null,
      modifiedAt: (dashboard as any).modifiedAt || null,
      url: (dashboard as any).url || '',
      layoutType: (dashboard as any).layoutType || 'ordered',
      isReadOnly: (dashboard as any).isReadOnly || false,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async listMonitors(params: MonitorListParams): Promise<McpToolResult> {
    const result = await this.client.listMonitors(params);
    
    const formattedResult = result.map(monitor => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      query: monitor.query,
      message: monitor.message,
      tags: monitor.tags,
      options: monitor.options,
      overallState: monitor.overallState,
      created: monitor.created,
      modified: monitor.modified,
      // multiAlert: monitor.multiAlert,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async getServiceMap(params: ServiceMapParams): Promise<McpToolResult> {
    const result = await this.client.getServiceMap(params);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async listHosts(params: InfrastructureListParams): Promise<McpToolResult> {
    const result = await this.client.listHosts(params);
    
    const formattedResult = {
      hostList: result.hostList?.map(host => ({
        aliases: host.aliases,
        apps: host.apps,
        awsName: host.awsName,
        hostName: host.hostName,
        id: host.id,
        isMuted: host.isMuted,
        lastReportedTime: host.lastReportedTime,
        meta: host.meta,
        metrics: host.metrics,
        muteTimeout: host.muteTimeout,
        name: host.name,
        sources: host.sources,
        tagsBySource: host.tagsBySource,
        up: host.up,
      })),
      totalMatching: result.totalMatching,
      totalReturned: result.totalReturned,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async getActiveMetrics(): Promise<McpToolResult> {
    try {
      const from = Math.floor(Date.now() / 1000) - 3600;
      
      const metricsQuery = await this.client.queryMetrics({
        query: "*",
        from,
        to: Math.floor(Date.now() / 1000),
      });
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            availableMetrics: metricsQuery.series?.map(s => s.metric) || [],
            timeRange: {
              from,
              to: Math.floor(Date.now() / 1000),
            },
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error retrieving active metrics: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }

  async searchTraces(params: TraceSearchParams): Promise<McpToolResult> {
    const result = await this.client.searchTraces(params);
    
    const formattedResult = {
      traces: result.data?.map((log: any) => ({
        id: log.id,
        timestamp: log.attributes?.timestamp,
        service: log.attributes?.service,
        message: log.attributes?.message,
        status: log.attributes?.status,
        host: log.attributes?.host,
        tags: log.attributes?.tags,
      })) || [],
      meta: result.meta,
      query_used: params.query,
      time_range: {
        start: params.start,
        end: params.end,
      }
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async listServices(params: ServicesListParams): Promise<McpToolResult> {
    const result = await this.client.listServices(params);
    
    const services = new Set<string>();
    result.series?.forEach((series: any) => {
      if (series.scope && series.scope.service) {
        services.add(series.scope.service);
      }
    });

    const formattedResult = {
      services: Array.from(services).map(service => ({
        service,
        env: params.env || 'all',
        metric_data: result.series?.filter((s: any) => s.scope?.service === service) || [],
      })),
      query_info: {
        env: params.env,
        time_range: {
          start: params.start,
          end: params.end,
        }
      }
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }

  async getSpansMetrics(params: SpansMetricsParams): Promise<McpToolResult> {
    const result = await this.client.getSpansMetrics(params);
    
    const formattedResult = {
      metrics: {
        hits: {
          query: result.hits?.query || 'trace.servlet.request.hits',
          series: result.hits?.series?.map((series: any) => ({
            metric: series.metric,
            displayName: series.displayName,
            pointlist: series.pointlist,
          })) || [],
        },
        duration: {
          query: result.duration?.query || 'trace.servlet.request.duration',
          series: result.duration?.series?.map((series: any) => ({
            metric: series.metric,
            displayName: series.displayName,
            pointlist: series.pointlist,
          })) || [],
        },
        errors: {
          query: result.errors?.query || 'trace.servlet.request.errors',
          series: result.errors?.series?.map((series: any) => ({
            metric: series.metric,
            displayName: series.displayName,
            pointlist: series.pointlist,
          })) || [],
        },
      },
      query_info: result.query_info,
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(formattedResult, null, 2)
      }]
    };
  }
}
