import { ClientHubApiClient } from "./api-client.js";
import {
  ClientHubMCPError,
  GetClient360Params,
  ListLinksParams,
  McpToolResult,
  SearchClientParams,
  SearchConversationsParams,
} from "./types.js";

export class ClientHubMCPTools {
  constructor(private readonly api: ClientHubApiClient) {}

  private toResult(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private toError(error: unknown): McpToolResult {
    const message =
      error instanceof ClientHubMCPError
        ? this.friendlyMessage(error)
        : "Unexpected error while contacting the Client Hub. Please try again.";
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }

  private friendlyMessage(error: ClientHubMCPError): string {
    switch (error.code) {
      case "TIMEOUT":
        return "The Client Hub took too long to respond. Please try again in a moment.";
      case "UNREACHABLE":
        return "Could not reach the Client Hub right now. Please try again in a moment.";
      case "NO_AUTH_TOKEN":
        return "Not authenticated. Please reconnect to the Client Hub.";
      case "API_ERROR":
        return `The Client Hub returned an error (${error.message.replace(/\D/g, "") || "unknown"}). Please try again or contact support.`;
      default:
        return "Could not complete the request against the Client Hub. Please try again.";
    }
  }

  async searchClient(
    params: SearchClientParams,
    authToken?: string
  ): Promise<McpToolResult> {
    try {
      const data = await this.api.request(
        "GET",
        "v1/client-hub/clients",
        {
          query: params.query,
          limit: params.limit !== undefined ? String(params.limit) : undefined,
        },
        authToken
      );
      return this.toResult(data);
    } catch (error) {
      return this.toError(error);
    }
  }

  async getClient360(
    params: GetClient360Params,
    authToken?: string
  ): Promise<McpToolResult> {
    try {
      const data = await this.api.request(
        "GET",
        `v1/client-hub/clients/${params.clientId}/360`,
        undefined,
        authToken
      );

      if (this.isEmpty(data)) {
        return this.toResult({
          found: false,
          clientId: params.clientId,
          message:
            "No 360 data available for this client yet. The client may not have been materialized in the analytics mart.",
        });
      }

      return this.toResult(data);
    } catch (error) {
      return this.toError(error);
    }
  }

  async listLinks(
    params: ListLinksParams,
    authToken?: string
  ): Promise<McpToolResult> {
    try {
      const data = await this.api.request(
        "GET",
        `v1/client-hub/clients/${params.clientId}/links`,
        undefined,
        authToken
      );
      return this.toResult(data);
    } catch (error) {
      return this.toError(error);
    }
  }

  async searchConversations(
    params: SearchConversationsParams,
    authToken?: string
  ): Promise<McpToolResult> {
    try {
      const data = await this.api.request(
        "GET",
        `v1/client-hub/clients/${params.clientId}/conversations/search`,
        {
          query: params.query,
          source: params.source,
          limit: params.limit !== undefined ? String(params.limit) : undefined,
        },
        authToken
      );
      return this.toResult(data);
    } catch (error) {
      return this.toError(error);
    }
  }

  private isEmpty(data: unknown): boolean {
    if (data === null || data === undefined) {
      return true;
    }
    if (Array.isArray(data)) {
      return data.length === 0;
    }
    if (typeof data === "object") {
      return Object.keys(data as Record<string, unknown>).length === 0;
    }
    return false;
  }
}
