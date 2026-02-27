import { z } from "zod";

export const LogLevel = z.enum(["debug", "info", "warn", "error", "fatal"]);
export type LogLevel = z.infer<typeof LogLevel>;

export const Framework = z.enum(["react", "nextjs", "nestjs", "unknown"]);
export type Framework = z.infer<typeof Framework>;

export const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: LogLevel,
  message: z.string(),
  source: z.string().optional(),
  framework: Framework.optional(),
  metadata: z.record(z.unknown()).optional(),
  stackTrace: z.string().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const HttpRequestSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  method: z.string(),
  url: z.string(),
  statusCode: z.number().optional(),
  duration: z.number().optional(),
  requestHeaders: z.record(z.string()).optional(),
  responseHeaders: z.record(z.string()).optional(),
  requestBody: z.unknown().optional(),
  responseBody: z.unknown().optional(),
  framework: Framework.optional(),
  error: z.string().optional(),
});
export type HttpRequest = z.infer<typeof HttpRequestSchema>;

export const PerformanceMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string(),
  tags: z.record(z.string()).optional(),
});
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

export const ProcessInfoSchema = z.object({
  pid: z.number(),
  uptime: z.number(),
  memoryUsage: z.object({
    rss: z.number(),
    heapTotal: z.number(),
    heapUsed: z.number(),
    external: z.number(),
  }),
  cpuUsage: z.object({
    user: z.number(),
    system: z.number(),
  }),
  nodeVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  cwd: z.string(),
  env: z.record(z.string()).optional(),
});
export type ProcessInfo = z.infer<typeof ProcessInfoSchema>;

export const TailLogsParamsSchema = z.object({
  lines: z.number().min(1).max(1000).default(50).describe("Number of recent log lines to retrieve"),
  level: LogLevel.optional().describe("Filter by log level"),
  framework: Framework.optional().describe("Filter by framework"),
  source: z.string().optional().describe("Filter by source file or module"),
});
export type TailLogsParams = z.infer<typeof TailLogsParamsSchema>;

export const SearchLogsParamsSchema = z.object({
  query: z.string().min(1).describe("Search pattern (supports regex)"),
  level: LogLevel.optional().describe("Filter by log level"),
  framework: Framework.optional().describe("Filter by framework"),
  limit: z.number().min(1).max(500).default(50).describe("Maximum results to return"),
  since: z.string().optional().describe("ISO timestamp to search from"),
});
export type SearchLogsParams = z.infer<typeof SearchLogsParamsSchema>;

export const GetErrorsParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(20).describe("Maximum errors to return"),
  framework: Framework.optional().describe("Filter by framework"),
  grouped: z.boolean().default(false).describe("Group similar errors together"),
});
export type GetErrorsParams = z.infer<typeof GetErrorsParamsSchema>;

export const InspectRequestParamsSchema = z.object({
  id: z.string().optional().describe("Specific request ID to inspect"),
  method: z.string().optional().describe("Filter by HTTP method"),
  urlPattern: z.string().optional().describe("Filter by URL pattern (supports regex)"),
  statusCode: z.number().optional().describe("Filter by status code"),
  limit: z.number().min(1).max(100).default(20).describe("Maximum requests to return"),
});
export type InspectRequestParams = z.infer<typeof InspectRequestParamsSchema>;

export const GetPerformanceParamsSchema = z.object({
  metric: z.string().optional().describe("Specific metric name to retrieve"),
  since: z.string().optional().describe("ISO timestamp to get metrics from"),
  limit: z.number().min(1).max(100).default(20).describe("Maximum metrics to return"),
});
export type GetPerformanceParams = z.infer<typeof GetPerformanceParamsSchema>;

export const ExecuteInContextParamsSchema = z.object({
  expression: z.string().min(1).describe("JavaScript expression to evaluate"),
  framework: Framework.optional().describe("Target framework context"),
});
export type ExecuteInContextParams = z.infer<typeof ExecuteInContextParamsSchema>;

export const WatchParamsSchema = z.object({
  pattern: z.string().min(1).describe("File glob pattern or log pattern to watch"),
  duration: z.number().min(1).max(300).default(30).describe("Watch duration in seconds"),
});
export type WatchParams = z.infer<typeof WatchParamsSchema>;

export class RuntimeLensError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "RuntimeLensError";
  }
}
