import type { McpToolResult } from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export function toolOk(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(error: unknown, details?: Record<string, unknown>): McpToolResult {
  const message =
    typeof error === "string"
      ? error
      : error instanceof SlackAdvancedMCPError
        ? `Slack Error: ${error.message}`
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error: Unknown error";

  const code = error instanceof SlackAdvancedMCPError ? error.code : undefined;

  return {
    content: [{ type: "text", text: JSON.stringify({ error: message, ...(code && { code }), ...details }, null, 2) }],
    isError: true,
  };
}
