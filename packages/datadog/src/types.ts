import { z } from "zod";

export const DatadogConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  appKey: z.string().min(1, "Application key is required"),
  site: z.string().default("datadoghq.com"),
});

export type DatadogConfig = z.infer<typeof DatadogConfigSchema>;

export const MetricQueryParamsSchema = z.object({
  query: z.string().min(1, "Metric query is required"),
  from: z.number().int().positive("From timestamp must be positive"),
  to: z.number().int().positive("To timestamp must be positive"),
});

export type MetricQueryParams = z.infer<typeof MetricQueryParamsSchema>;

export const LogQueryParamsSchema = z.object({
  query: z.string().min(1, "Log query is required"),
  time: z.object({
    from: z.string(),
    to: z.string(),
  }),
  limit: z.number().int().positive().max(1000).default(50),
});

export type LogQueryParams = z.infer<typeof LogQueryParamsSchema>;

export const DashboardListParamsSchema = z.object({
  count: z.number().int().positive().max(100).default(25),
  start: z.number().int().nonnegative().default(0),
});

export type DashboardListParams = z.infer<typeof DashboardListParamsSchema>;

export const MonitorListParamsSchema = z.object({
  groupStates: z.array(z.string()).optional(),
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  monitorTags: z.array(z.string()).optional(),
  withDowntimes: z.boolean().default(true),
});

export type MonitorListParams = z.infer<typeof MonitorListParamsSchema>;

export const ServiceMapParamsSchema = z.object({
  env: z.string().min(1, "Environment is required"),
  start: z.number().int().positive("Start timestamp must be positive"),
  end: z.number().int().positive("End timestamp must be positive"),
});

export type ServiceMapParams = z.infer<typeof ServiceMapParamsSchema>;

export const InfrastructureListParamsSchema = z.object({
  filter: z.string().optional(),
  sortField: z.enum(["status", "name", "checkTime", "triggerTime"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  start: z.number().int().nonnegative().default(0),
  count: z.number().int().positive().max(1000).default(100),
});

export type InfrastructureListParams = z.infer<typeof InfrastructureListParamsSchema>;

export const TraceSearchParamsSchema = z.object({
  query: z.string().default("*"),
  start: z.number().int().positive("Start timestamp must be positive"),
  end: z.number().int().positive("End timestamp must be positive"),
  limit: z.number().int().positive().max(1000).default(50),
});

export type TraceSearchParams = z.infer<typeof TraceSearchParamsSchema>;

export const ServicesListParamsSchema = z.object({
  start: z.number().int().positive("Start timestamp must be positive"),
  end: z.number().int().positive("End timestamp must be positive"),
  env: z.string().optional(),
});

export type ServicesListParams = z.infer<typeof ServicesListParamsSchema>;

export const SpansMetricsParamsSchema = z.object({
  start: z.number().int().positive("Start timestamp must be positive"),
  end: z.number().int().positive("End timestamp must be positive"),
  service: z.string().optional(),
  operation: z.string().optional(),
  resource: z.string().optional(),
  env: z.string().optional(),
});

export type SpansMetricsParams = z.infer<typeof SpansMetricsParamsSchema>;

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class DatadogMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "DatadogMCPError";
  }
}
