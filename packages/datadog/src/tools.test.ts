import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatadogMCPTools } from "./tools.js";
import { DatadogClient } from "./datadog-client.js";

vi.mock("./datadog-client.js", () => ({
  DatadogClient: vi.fn(),
}));

describe("DatadogMCPTools", () => {
  let tools: DatadogMCPTools;
  let mockClient: {
    queryMetrics: ReturnType<typeof vi.fn>;
    searchLogs: ReturnType<typeof vi.fn>;
    listDashboards: ReturnType<typeof vi.fn>;
    listMonitors: ReturnType<typeof vi.fn>;
    getServiceMap: ReturnType<typeof vi.fn>;
    listHosts: ReturnType<typeof vi.fn>;
    searchTraces: ReturnType<typeof vi.fn>;
    listServices: ReturnType<typeof vi.fn>;
    getSpansMetrics: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      queryMetrics: vi.fn(),
      searchLogs: vi.fn(),
      listDashboards: vi.fn(),
      listMonitors: vi.fn(),
      getServiceMap: vi.fn(),
      listHosts: vi.fn(),
      searchTraces: vi.fn(),
      listServices: vi.fn(),
      getSpansMetrics: vi.fn(),
    };
    tools = new DatadogMCPTools(mockClient as unknown as DatadogClient);
  });

  describe("queryMetrics", () => {
    it("should return formatted metrics query result", async () => {
      mockClient.queryMetrics.mockResolvedValue({
        status: "ok",
        series: [
          {
            metric: "system.cpu.idle",
            displayName: "CPU Idle",
            unit: "percent",
            pointlist: [[1609459200000, 80]],
            length: 1,
          },
        ],
        fromDate: 1609459200000,
        toDate: 1609459800000,
        query: "avg:system.cpu.idle{*}",
      });

      const result = await tools.queryMetrics({
        query: "avg:system.cpu.idle{*}",
        from: 1609459200,
        to: 1609459800,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("ok");
      expect(parsed.series).toHaveLength(1);
      expect(parsed.series[0].metric).toBe("system.cpu.idle");
    });
  });

  describe("searchLogs", () => {
    it("should return formatted logs search result", async () => {
      mockClient.searchLogs.mockResolvedValue({
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
        meta: {},
        links: {},
      });

      const result = await tools.searchLogs({
        query: "service:api",
        time: { from: "2024-01-01T00:00:00Z", to: "2024-01-01T01:00:00Z" },
        limit: 10,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0].attributes.service).toBe("api");
    });
  });

  describe("listDashboards", () => {
    it("should return formatted dashboards list", async () => {
      mockClient.listDashboards.mockResolvedValue([
        {
          id: "dashboard-1",
          title: "System Metrics",
          description: "Overview of system metrics",
          authorHandle: "admin",
          createdAt: "2024-01-01",
          modifiedAt: "2024-01-02",
          url: "https://app.datadoghq.com/dashboard/abc",
          layoutType: "ordered",
          isReadOnly: false,
        },
      ]);

      const result = await tools.listDashboards({ count: 10, start: 0 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("dashboard-1");
      expect(parsed[0].title).toBe("System Metrics");
    });
  });

  describe("listMonitors", () => {
    it("should return formatted monitors list", async () => {
      mockClient.listMonitors.mockResolvedValue([
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
      ]);

      const result = await tools.listMonitors({ withDowntimes: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe("CPU Monitor");
    });
  });

  describe("getServiceMap", () => {
    it("should return service map result", async () => {
      mockClient.getServiceMap.mockResolvedValue({
        message: "Service map functionality requires APM setup",
        env: "production",
        timeRange: { start: 1609459200, end: 1609459800 },
      });

      const result = await tools.getServiceMap({
        env: "production",
        start: 1609459200,
        end: 1609459800,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.env).toBe("production");
    });
  });

  describe("listHosts", () => {
    it("should return formatted hosts list", async () => {
      mockClient.listHosts.mockResolvedValue({
        hostList: [
          {
            hostName: "web-server-1",
            id: 1,
            name: "web-server-1",
            up: true,
          },
        ],
        totalMatching: 1,
        totalReturned: 1,
      });

      const result = await tools.listHosts({
        count: 100,
        start: 0,
        sortField: "name",
        sortDir: "asc",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hostList).toHaveLength(1);
      expect(parsed.totalMatching).toBe(1);
    });
  });

  describe("getActiveMetrics", () => {
    it("should return available metrics", async () => {
      mockClient.queryMetrics.mockResolvedValue({
        series: [{ metric: "system.cpu.idle" }, { metric: "system.mem.used" }],
      });

      const result = await tools.getActiveMetrics();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.availableMetrics).toHaveLength(2);
      expect(parsed.timeRange).toBeDefined();
    });

    it("should handle errors gracefully", async () => {
      mockClient.queryMetrics.mockRejectedValue(new Error("API Error"));

      const result = await tools.getActiveMetrics();

      expect(result.content[0].text).toContain(
        "Error retrieving active metrics"
      );
    });
  });

  describe("searchTraces", () => {
    it("should return formatted traces search result", async () => {
      mockClient.searchTraces.mockResolvedValue({
        data: [
          {
            id: "trace-1",
            attributes: {
              timestamp: "2024-01-01T00:00:00Z",
              service: "api",
              message: "HTTP request",
              status: "ok",
              host: "web-1",
              tags: ["env:prod"],
            },
          },
        ],
        meta: {},
      });

      const result = await tools.searchTraces({
        query: "service:api",
        start: 1609459200,
        end: 1609459800,
        limit: 50,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0].service).toBe("api");
      expect(parsed.query_used).toBe("service:api");
    });
  });

  describe("listServices", () => {
    it("should return formatted services list", async () => {
      mockClient.listServices.mockResolvedValue({
        series: [
          { scope: { service: "api" } },
          { scope: { service: "worker" } },
        ],
      });

      const result = await tools.listServices({
        start: 1609459200,
        end: 1609459800,
        env: "production",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.services).toBeDefined();
      expect(parsed.query_info.env).toBe("production");
    });
  });

  describe("getSpansMetrics", () => {
    it("should return formatted spans metrics", async () => {
      mockClient.getSpansMetrics.mockResolvedValue({
        hits: {
          query: "trace.servlet.request.hits",
          series: [{ metric: "trace.servlet.request.hits", pointlist: [] }],
        },
        duration: {
          query: "trace.servlet.request.duration",
          series: [],
        },
        errors: {
          query: "trace.servlet.request.errors",
          series: [],
        },
        query_info: {
          service: "api",
          env: "production",
        },
      });

      const result = await tools.getSpansMetrics({
        start: 1609459200,
        end: 1609459800,
        service: "api",
        env: "production",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.metrics.hits).toBeDefined();
      expect(parsed.metrics.duration).toBeDefined();
      expect(parsed.metrics.errors).toBeDefined();
      expect(parsed.query_info.service).toBe("api");
    });
  });
});
