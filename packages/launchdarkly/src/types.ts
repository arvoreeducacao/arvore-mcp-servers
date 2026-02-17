import { z } from "zod";

export const LaunchDarklyConfigSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  baseUrl: z.string().url().default("https://app.launchdarkly.com"),
  defaultProject: z.string().default("default"),
  defaultEnvironment: z.string().default("production"),
});

export type LaunchDarklyConfig = z.infer<typeof LaunchDarklyConfigSchema>;

export const ListFlagsParamsSchema = z.object({
  projectKey: z.string().optional(),
  environment: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  filter: z.string().optional(),
  sort: z.string().optional(),
});

export const GetFlagParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKey: z.string().min(1),
  environment: z.string().optional(),
});

export const ToggleFlagParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKey: z.string().min(1),
  environment: z.string().optional(),
  state: z.boolean(),
});

export const CreateFlagParamsSchema = z.object({
  projectKey: z.string().optional(),
  name: z.string().min(1),
  key: z.string().min(1),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  temporary: z.boolean().optional().default(true),
});

export const SearchFlagsParamsSchema = z.object({
  projectKey: z.string().optional(),
  query: z.string().min(1),
  environment: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
});

export const ListProjectsParamsSchema = z.object({});

export const ListEnvironmentsParamsSchema = z.object({
  projectKey: z.string().optional(),
});

export const GetFlagStatusesParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKeys: z.array(z.string()).min(1),
  environmentKeys: z.array(z.string()).optional(),
});

const ClauseSchema = z.object({
  attribute: z.string().default(""),
  op: z.enum(["in", "endsWith", "startsWith", "matches", "contains", "lessThan", "lessThanOrEqual", "greaterThan", "greaterThanOrEqual", "segmentMatch"]),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])),
  contextKind: z.string().optional().default("user"),
  negate: z.boolean().optional().default(false),
});

export const AddFlagRuleParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKey: z.string().min(1),
  environment: z.string().optional(),
  clauses: z.array(ClauseSchema).min(1),
  variationIndex: z.number().int().min(0),
  description: z.string().optional().default(""),
  comment: z.string().optional().default(""),
});

export const UpdateFlagTargetingParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKey: z.string().min(1),
  environment: z.string().optional(),
  instructions: z.array(z.record(z.unknown())).min(1),
  comment: z.string().optional().default(""),
});

export const DeleteFlagParamsSchema = z.object({
  projectKey: z.string().optional(),
  flagKey: z.string().min(1),
});

export const ListSegmentsParamsSchema = z.object({
  projectKey: z.string().optional(),
  environment: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const GetSegmentParamsSchema = z.object({
  projectKey: z.string().optional(),
  environment: z.string().optional(),
  segmentKey: z.string().min(1),
});

export type ListFlagsParams = z.infer<typeof ListFlagsParamsSchema>;
export type GetFlagParams = z.infer<typeof GetFlagParamsSchema>;
export type ToggleFlagParams = z.infer<typeof ToggleFlagParamsSchema>;
export type CreateFlagParams = z.infer<typeof CreateFlagParamsSchema>;
export type SearchFlagsParams = z.infer<typeof SearchFlagsParamsSchema>;
export type ListProjectsParams = z.infer<typeof ListProjectsParamsSchema>;
export type ListEnvironmentsParams = z.infer<typeof ListEnvironmentsParamsSchema>;
export type GetFlagStatusesParams = z.infer<typeof GetFlagStatusesParamsSchema>;
export type AddFlagRuleParams = z.infer<typeof AddFlagRuleParamsSchema>;
export type UpdateFlagTargetingParams = z.infer<typeof UpdateFlagTargetingParamsSchema>;
export type DeleteFlagParams = z.infer<typeof DeleteFlagParamsSchema>;
export type ListSegmentsParams = z.infer<typeof ListSegmentsParamsSchema>;
export type GetSegmentParams = z.infer<typeof GetSegmentParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class LaunchDarklyMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "LaunchDarklyMCPError";
  }
}
