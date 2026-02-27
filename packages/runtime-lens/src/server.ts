import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LogCollector } from "./log-collector.js";
import { ProcessInspector } from "./process-inspector.js";
import { RuntimeInterceptor } from "./runtime-interceptor.js";
import {
  TailLogsParamsSchema,
  SearchLogsParamsSchema,
  GetErrorsParamsSchema,
  InspectRequestParamsSchema,
  GetPerformanceParamsSchema,
} from "./types.js";

export class RuntimeLensMCPServer {
  private readonly server: McpServer;
  private readonly collector: LogCollector;
  private readonly inspector: ProcessInspector;
  private readonly interceptor: RuntimeInterceptor;

  constructor(projectRoot?: string, logPaths?: string[]) {
    this.server = new McpServer({
      name: "runtime-lens-mcp",
      version: "1.0.0",
    });

    this.collector = new LogCollector(projectRoot, logPaths);
    this.inspector = new ProcessInspector(projectRoot);
    this.interceptor = new RuntimeInterceptor(this.collector);

    this.setupTools();
  }

  static fromEnvironment(): RuntimeLensMCPServer {
    const projectRoot = process.env.RUNTIME_LENS_PROJECT_ROOT || process.cwd();
    const logPaths = process.env.RUNTIME_LENS_LOG_PATHS?.split(",").filter(Boolean) || [];
    return new RuntimeLensMCPServer(projectRoot, logPaths);
  }

  private setupTools(): void {
    this.registerTailLogs();
    this.registerSearchLogs();
    this.registerGetErrors();
    this.registerInspectRequests();
    this.registerGetPerformance();
    this.registerGetEnvInfo();
    this.registerClearLogs();
    this.registerGetStats();
    this.registerStartInterceptor();
    this.registerStopInterceptor();
    this.registerCollectLogs();
    this.registerScanProject();
    this.registerFindProcesses();
    this.registerGetPorts();
  }

  private registerTailLogs(): void {
    this.server.registerTool(
      "tail_logs",
      {
        title: "Tail Logs",
        description: "Retrieve recent log entries from the application buffer. Supports filtering by level, framework, and source.",
        inputSchema: {
          lines: TailLogsParamsSchema.shape.lines,
          level: TailLogsParamsSchema.shape.level,
          framework: TailLogsParamsSchema.shape.framework,
          source: TailLogsParamsSchema.shape.source,
        },
      },
      async (params) => {
        const logs = this.collector.getLogs(params);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(logs, null, 2),
          }],
        };
      }
    );
  }

  private registerSearchLogs(): void {
    this.server.registerTool(
      "search_logs",
      {
        title: "Search Logs",
        description: "Search through collected logs using regex patterns. Filter by level, framework, and time range.",
        inputSchema: {
          query: SearchLogsParamsSchema.shape.query,
          level: SearchLogsParamsSchema.shape.level,
          framework: SearchLogsParamsSchema.shape.framework,
          limit: SearchLogsParamsSchema.shape.limit,
          since: SearchLogsParamsSchema.shape.since,
        },
      },
      async (params) => {
        const logs = this.collector.searchLogs(params as any);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(logs, null, 2),
          }],
        };
      }
    );
  }

  private registerGetErrors(): void {
    this.server.registerTool(
      "get_errors",
      {
        title: "Get Errors",
        description: "Retrieve recent errors with stack traces. Optionally group similar errors together to identify patterns.",
        inputSchema: {
          limit: GetErrorsParamsSchema.shape.limit,
          framework: GetErrorsParamsSchema.shape.framework,
          grouped: GetErrorsParamsSchema.shape.grouped,
        },
      },
      async (params) => {
        const errors = this.collector.getErrors(params);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(errors, null, 2),
          }],
        };
      }
    );
  }

  private registerInspectRequests(): void {
    this.server.registerTool(
      "inspect_requests",
      {
        title: "Inspect HTTP Requests",
        description: "Inspect captured HTTP requests and responses. Filter by method, URL pattern, status code, or specific request ID.",
        inputSchema: {
          id: InspectRequestParamsSchema.shape.id,
          method: InspectRequestParamsSchema.shape.method,
          urlPattern: InspectRequestParamsSchema.shape.urlPattern,
          statusCode: InspectRequestParamsSchema.shape.statusCode,
          limit: InspectRequestParamsSchema.shape.limit,
        },
      },
      async (params) => {
        const requests = this.collector.getRequests(params);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(requests, null, 2),
          }],
        };
      }
    );
  }

  private registerGetPerformance(): void {
    this.server.registerTool(
      "get_performance",
      {
        title: "Get Performance Metrics",
        description: "Retrieve performance metrics including memory usage, CPU, and custom metrics from the application.",
        inputSchema: {
          metric: GetPerformanceParamsSchema.shape.metric,
          since: GetPerformanceParamsSchema.shape.since,
          limit: GetPerformanceParamsSchema.shape.limit,
        },
      },
      async (params) => {
        await this.collector.collectFromProcess();
        const metrics = this.collector.getMetrics(params);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(metrics, null, 2),
          }],
        };
      }
    );
  }

  private registerGetEnvInfo(): void {
    this.server.registerTool(
      "get_env_info",
      {
        title: "Get Environment Info",
        description: "Get comprehensive environment information including running Node.js processes, listening ports, project framework detection, and system resources.",
        inputSchema: {},
      },
      async () => {
        const info = await this.inspector.getEnvironmentInfo();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(info, null, 2),
          }],
        };
      }
    );
  }

  private registerClearLogs(): void {
    this.server.registerTool(
      "clear_logs",
      {
        title: "Clear Log Buffer",
        description: "Clear all collected logs, requests, and metrics from the buffer.",
        inputSchema: {},
      },
      async () => {
        const result = this.collector.clearLogs();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ message: `Cleared ${result.cleared} entries` }),
          }],
        };
      }
    );
  }

  private registerGetStats(): void {
    this.server.registerTool(
      "get_stats",
      {
        title: "Get Log Statistics",
        description: "Get statistics about collected logs including counts by level and framework.",
        inputSchema: {},
      },
      async () => {
        const stats = this.collector.getStats();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(stats, null, 2),
          }],
        };
      }
    );
  }

  private registerStartInterceptor(): void {
    this.server.registerTool(
      "start_interceptor",
      {
        title: "Start Console Interceptor",
        description: "Start intercepting console.log/warn/error/debug calls and stderr output in real-time. Captured output is stored in the log buffer.",
        inputSchema: {},
      },
      async () => {
        this.interceptor.startIntercepting();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ message: "Console interceptor started", active: true }),
          }],
        };
      }
    );
  }

  private registerStopInterceptor(): void {
    this.server.registerTool(
      "stop_interceptor",
      {
        title: "Stop Console Interceptor",
        description: "Stop intercepting console output. Previously captured logs remain in the buffer.",
        inputSchema: {},
      },
      async () => {
        this.interceptor.stopIntercepting();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ message: "Console interceptor stopped", active: false }),
          }],
        };
      }
    );
  }

  private registerCollectLogs(): void {
    this.server.registerTool(
      "collect_from_files",
      {
        title: "Collect Logs from Files",
        description: "Scan and collect logs from log files in the project directory. Automatically discovers .log and .json files in common log directories.",
        inputSchema: {},
      },
      async () => {
        await this.collector.collectFromFiles();
        const stats = this.collector.getStats();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ message: "Log collection complete", stats }),
          }],
        };
      }
    );
  }

  private registerScanProject(): void {
    this.server.registerTool(
      "scan_project",
      {
        title: "Scan Project Structure",
        description: "Analyze the project to detect framework (React/Next.js/NestJS), find log files, and list configuration files.",
        inputSchema: {},
      },
      async () => {
        const structure = await this.collector.scanProjectStructure();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(structure, null, 2),
          }],
        };
      }
    );
  }

  private registerFindProcesses(): void {
    this.server.registerTool(
      "find_processes",
      {
        title: "Find Running Node Processes",
        description: "Find running Node.js processes related to React, Next.js, or NestJS applications.",
        inputSchema: {},
      },
      async () => {
        const processes = await this.inspector.findRunningProcesses();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(processes, null, 2),
          }],
        };
      }
    );
  }

  private registerGetPorts(): void {
    this.server.registerTool(
      "get_listening_ports",
      {
        title: "Get Listening Ports",
        description: "List all TCP ports currently being listened on by Node.js processes.",
        inputSchema: {},
      },
      async () => {
        const ports = await this.inspector.getPortListeners();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(ports, null, 2),
          }],
        };
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Runtime Lens MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Runtime Lens MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      this.interceptor.stopIntercepting();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
