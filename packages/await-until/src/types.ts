import { z } from "zod";

const MatchConditionSchema = z.enum(["contains", "not_contains", "equals", "not_equals", "regex", "exists", "not_empty"]).describe(
  "How to evaluate the output. 'contains': stdout contains the string. 'not_contains': stdout does NOT contain the string. 'equals': stdout exactly equals the string (trimmed). 'not_equals': stdout does NOT equal the string. 'regex': stdout matches the regex pattern. 'exists': only checks exit code is 0. 'not_empty': stdout is not empty."
);

const McpMatchConditionSchema = z.enum(["contains", "not_contains", "equals", "not_equals", "regex", "not_empty"]).describe(
  "How to evaluate the MCP tool result text."
);

export const AwaitCommandSchema = z.object({
  command: z.string().describe("Shell command to execute on each poll"),
  match: MatchConditionSchema.default("exists"),
  pattern: z.string().optional().describe("The string or regex pattern to match against stdout. Required for contains/not_contains/equals/not_equals/regex"),
  interval_seconds: z.number().min(1).max(300).default(5).describe("Seconds between each poll attempt"),
  timeout_seconds: z.number().min(1).max(3600).default(120).describe("Maximum seconds to wait before giving up"),
  cwd: z.string().optional().describe("Working directory for the command"),
  shell: z.string().optional().describe("Shell to use (defaults to /bin/bash)"),
});

export const AwaitUrlSchema = z.object({
  url: z.string().url().describe("URL to poll"),
  method: z.enum(["GET", "POST", "HEAD"]).default("GET").describe("HTTP method"),
  expected_status: z.number().optional().describe("Expected HTTP status code (e.g. 200). If omitted, any 2xx is accepted"),
  body_contains: z.string().optional().describe("String that the response body must contain"),
  headers: z.record(z.string()).optional().describe("Custom headers to send with the request"),
  interval_seconds: z.number().min(1).max(300).default(5).describe("Seconds between each poll attempt"),
  timeout_seconds: z.number().min(1).max(3600).default(120).describe("Maximum seconds to wait before giving up"),
});

export const AwaitFileSchema = z.object({
  path: z.string().describe("Absolute or relative file path to watch"),
  match: z.enum(["exists", "not_exists", "contains", "regex", "not_empty"]).default("exists").describe("Condition to check"),
  pattern: z.string().optional().describe("String or regex to match against file contents. Required for contains/regex"),
  interval_seconds: z.number().min(1).max(300).default(3).describe("Seconds between each poll attempt"),
  timeout_seconds: z.number().min(1).max(3600).default(120).describe("Maximum seconds to wait before giving up"),
});

export const AwaitMcpSchema = z.object({
  server_name: z.string().describe("Name of the MCP server as defined in your mcp.json config (e.g. 'datadog', 'slack', 'arvore-mysql')"),
  tool_name: z.string().describe("Name of the MCP tool to call on each poll (e.g. 'search_logs', 'query')"),
  tool_arguments: z.record(z.unknown()).default({}).describe("Arguments to pass to the MCP tool on each call"),
  match: McpMatchConditionSchema.default("not_empty"),
  pattern: z.string().optional().describe("String or regex to match against the tool's text output. Required for contains/not_contains/equals/not_equals/regex"),
  interval_seconds: z.number().min(1).max(300).default(10).describe("Seconds between each poll attempt"),
  timeout_seconds: z.number().min(1).max(3600).default(120).describe("Maximum seconds to wait before giving up"),
  mcp_config_path: z.string().optional().describe("Path to mcp.json. Auto-detected from Kiro (.kiro/settings/mcp.json), Cursor (.cursor/mcp.json), or Claude Desktop if omitted"),
});

export type AwaitCommandParams = z.infer<typeof AwaitCommandSchema>;
export type AwaitUrlParams = z.infer<typeof AwaitUrlSchema>;
export type AwaitFileParams = z.infer<typeof AwaitFileSchema>;
export type AwaitMcpParams = z.infer<typeof AwaitMcpSchema>;

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

export interface PollResult {
  success: boolean;
  attempts: number;
  elapsed_seconds: number;
  last_output?: string;
  error?: string;
}
