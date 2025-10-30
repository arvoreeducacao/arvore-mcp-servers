import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatadogClient } from "./datadog-client.js";
import { DatadogMCPError } from "./types.js";
import { v1, v2 } from "@datadog/datadog-api-client";

vi.mock("@datadog/datadog-api-client", () => ({
  client: {
    createConfiguration: vi.fn(() => ({})),
  },
  v1: {
    MetricsApi: vi.fn(),
    DashboardsApi: vi.fn(),
    MonitorsApi: vi.fn(),
    HostsApi: vi.fn(),
  },
  v2: {
    LogsApi: vi.fn(),
  },
}));

describe("DatadogClient", () => {
  let datadogClient: DatadogClient;
  let mockMetricsApi: { queryMetrics: ReturnType<typeof vi.fn> };
  let mockLogsApi: { listLogs: ReturnType<typeof vi.fn> };
  let mockDashboardsApi: { listDashboards: ReturnType<typeof vi.fn> };
  let mockMonitorsApi: { listMonitors: ReturnType<typeof vi.fn> };
  let mockHostsApi: { listHosts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetricsApi = { queryMetrics: vi.fn() };
    mockLogsApi = { listLogs: vi.fn() };
    mockDashboardsApi = { listDashboards: vi.fn() };
    mockMonitorsApi = { listMonitors: vi.fn() };
    mockHostsApi = { listHosts: vi.fn() };

    (v1.MetricsApi as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockMetricsApi
    );
    (v2.LogsApi as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockLogsApi
    );
    (
      v1.DashboardsApi as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mockDashboardsApi);
    (v1.MonitorsApi as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockMonitorsApi
    );
    (v1.HostsApi as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockHostsApi
    );

    datadogClient = new DatadogClient({
      apiKey: "test-api-key",
      appKey: "test-app-key",
      site: "datadoghq.com",
    });
  });

  describe("queryMetrics", () => {
    it("should query metrics successfully", async () => {
      const mockResponse = {
        status: "ok",
        series: [
          {
            metric: "system.cpu.idle",
            displayName: "CPU Idle",
            unit: "percent",
            pointlist: [
              [1609459200000, 80],
              [1609459260000, 85],
            ],
            length: 2,
          },
        ],
        fromDate: 1609459200000,
        toDate: 1609459800000,
        query: "avg:system.cpu.idle{*}",
        message: "success",
      };
      mockMetricsApi.queryMetrics.mockResolvedValue(mockResponse);

      const result = await datadogClient.queryMetrics({
        query: "avg:system.cpu.idle{*}",
        from: 1609459200,
        to: 1609459800,
      });

      expect(result).toEqual(mockResponse);
      expect(mockMetricsApi.queryMetrics).toHaveBeenCalledWith({
        from: 1609459200,
        to: 1609459800,
        query: "avg:system.cpu.idle{*}",
      });
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockMetricsApi.queryMetrics.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.queryMetrics({
          query: "invalid.metric",
          from: 1609459200,
          to: 1609459800,
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("searchLogs", () => {
    it("should search logs successfully", async () => {
      const mockResponse = {
        data: [
          {
            id: "log-1",
            type: "log",
            attributes: {
              timestamp: "2024-01-01T00:00:00Z",
              host: "web-server-1",
              service: "api",
              message: "Request processed",
              status: "info",
              tags: ["env:production"],
            },
          },
        ],
        meta: { page: { after: "next-cursor" } },
        links: { next: "https://api.datadoghq.com/logs?cursor=next-cursor" },
      };
      mockLogsApi.listLogs.mockResolvedValue(mockResponse);

      const result = await datadogClient.searchLogs({
        query: "service:api",
        time: { from: "2024-01-01T00:00:00Z", to: "2024-01-01T01:00:00Z" },
        limit: 10,
      });

      expect(result).toEqual(mockResponse);
      expect(mockLogsApi.listLogs).toHaveBeenCalledWith({
        body: {
          filter: {
            query: "service:api",
            from: "2024-01-01T00:00:00Z",
            to: "2024-01-01T01:00:00Z",
          },
          page: { limit: 10 },
          sort: "timestamp",
        },
      });
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockLogsApi.listLogs.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.searchLogs({
          query: "invalid",
          time: { from: "2024-01-01T00:00:00Z", to: "2024-01-01T01:00:00Z" },
          limit: 10,
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("listDashboards", () => {
    it("should list dashboards successfully", async () => {
      const mockResponse = {
        dashboards: [
          { id: "dashboard-1", title: "System Metrics" } as any,
          { id: "dashboard-2", title: "API Performance" } as any,
        ],
      };
      mockDashboardsApi.listDashboards.mockResolvedValue(mockResponse);

      const result = await datadogClient.listDashboards({
        count: 10,
        start: 0,
      });

      expect(result).toHaveLength(2);
    });

    it("should return empty array when no dashboards", async () => {
      mockDashboardsApi.listDashboards.mockResolvedValue({ dashboards: [] });

      const result = await datadogClient.listDashboards({
        count: 10,
        start: 0,
      });

      expect(result).toEqual([]);
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockDashboardsApi.listDashboards.mockRejectedValue(
        new Error("API Error")
      );

      await expect(
        datadogClient.listDashboards({ count: 10, start: 0 })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("listMonitors", () => {
    it("should list monitors successfully", async () => {
      const mockResponse = [
        {
          id: 123,
          name: "CPU Monitor",
          type: "metric alert",
          query: "avg(last_5m):avg:system.cpu.idle{*} < 20",
          message: "CPU is too high",
          tags: ["env:production"],
          options: {},
          overallState: "OK",
          created: new Date("2024-01-01"),
          modified: new Date("2024-01-02"),
        },
      ];
      mockMonitorsApi.listMonitors.mockResolvedValue(mockResponse);

      const result = await datadogClient.listMonitors({ withDowntimes: true });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("CPU Monitor");
    });

    it("should handle monitor filters", async () => {
      mockMonitorsApi.listMonitors.mockResolvedValue([]);

      await datadogClient.listMonitors({
        groupStates: ["Alert", "Warn"],
        name: "CPU Monitor",
        tags: ["env:production"],
        monitorTags: ["team:backend"],
        withDowntimes: true,
      });

      expect(mockMonitorsApi.listMonitors).toHaveBeenCalledWith({
        groupStates: "Alert,Warn",
        name: "CPU Monitor",
        tags: "env:production",
        monitorTags: "team:backend",
        withDowntimes: true,
      });
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockMonitorsApi.listMonitors.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.listMonitors({ withDowntimes: true })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("getServiceMap", () => {
    it("should return placeholder service map data", async () => {
      const result = await datadogClient.getServiceMap({
        env: "production",
        start: 1609459200,
        end: 1609459800,
      });

      expect(result.message).toContain("not available");
      expect(result.env).toBe("production");
      expect(result.timeRange.start).toBe(1609459200);
      expect(result.timeRange.end).toBe(1609459800);
    });
  });

  describe("listHosts", () => {
    it("should list hosts successfully", async () => {
      const mockResponse = {
        hostList: [
          {
            aliases: ["web-1"],
            apps: ["nginx"],
            awsName: "i-123456",
            hostName: "web-server-1",
            id: 1,
            isMuted: false,
            lastReportedTime: 1609459800,
            meta: {},
            metrics: { cpu: 50 },
            muteTimeout: null,
            name: "web-server-1",
            sources: ["aws"],
            tagsBySource: {},
            up: true,
          },
        ],
        totalMatching: 1,
        totalReturned: 1,
      };
      mockHostsApi.listHosts.mockResolvedValue(mockResponse);

      const result = await datadogClient.listHosts({
        filter: "env:production",
        sortField: "name",
        sortDir: "asc",
        start: 0,
        count: 100,
      });

      expect(result.hostList).toHaveLength(1);
      expect(result.totalMatching).toBe(1);
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockHostsApi.listHosts.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.listHosts({
          count: 100,
          start: 0,
          sortField: "name",
          sortDir: "asc",
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("searchTraces", () => {
    it("should search traces successfully", async () => {
      mockLogsApi.listLogs.mockResolvedValue({
        data: [
          {
            id: "trace-1",
            attributes: {
              timestamp: "2024-01-01T00:00:00Z",
              service: "api",
              message: "HTTP request",
              status: "ok",
            },
          },
        ],
      });

      const result = await datadogClient.searchTraces({
        query: "service:api",
        start: 1609459200,
        end: 1609459800,
        limit: 50,
      });

      expect(result.data).toHaveLength(1);
    });

    it("should handle wildcard query", async () => {
      mockLogsApi.listLogs.mockResolvedValue({ data: [] });

      await datadogClient.searchTraces({
        query: "*",
        start: 1609459200,
        end: 1609459800,
        limit: 50,
      });

      expect(mockLogsApi.listLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            filter: expect.objectContaining({
              query: "@_top_level:1",
            }),
          }),
        })
      );
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockLogsApi.listLogs.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.searchTraces({
          query: "*",
          start: 1609459200,
          end: 1609459800,
          limit: 50,
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("listServices", () => {
    it("should list services successfully", async () => {
      mockMetricsApi.queryMetrics.mockResolvedValue({
        series: [
          { scope: { service: "api" } },
          { scope: { service: "worker" } },
        ],
      });

      const result = await datadogClient.listServices({
        start: 1609459200,
        end: 1609459800,
        env: "production",
      });

      expect(result.series).toBeDefined();
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockMetricsApi.queryMetrics.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.listServices({
          start: 1609459200,
          end: 1609459800,
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("getSpansMetrics", () => {
    it("should get spans metrics successfully", async () => {
      mockMetricsApi.queryMetrics.mockResolvedValue({
        series: [
          {
            metric: "trace.servlet.request.hits",
            pointlist: [[1609459200000, 100]],
          },
        ],
      });

      const result = await datadogClient.getSpansMetrics({
        start: 1609459200,
        end: 1609459800,
        service: "api",
        env: "production",
      });

      expect(result.hits).toBeDefined();
      expect(result.duration).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.query_info.service).toBe("api");
    });

    it("should build proper tag filters", async () => {
      mockMetricsApi.queryMetrics.mockResolvedValue({ series: [] });

      await datadogClient.getSpansMetrics({
        start: 1609459200,
        end: 1609459800,
        service: "api",
        env: "production",
      });

      expect(mockMetricsApi.queryMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining("{service:api,env:production}"),
        })
      );
    });

    it("should throw DatadogMCPError on failure", async () => {
      mockMetricsApi.queryMetrics.mockRejectedValue(new Error("API Error"));

      await expect(
        datadogClient.getSpansMetrics({
          start: 1609459200,
          end: 1609459800,
        })
      ).rejects.toThrow(DatadogMCPError);
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection", async () => {
      mockDashboardsApi.listDashboards.mockResolvedValue({ dashboards: [] });

      const result = await datadogClient.testConnection();

      expect(result).toBe(true);
    });

    it("should return false on connection failure", async () => {
      mockDashboardsApi.listDashboards.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await datadogClient.testConnection();

      expect(result).toBe(false);
    });
  });
});
