import { ClientHubApiClient } from "./api-client.js";
import {
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

  async searchClient(params: SearchClientParams): Promise<McpToolResult> {
    const data = await this.api.request("GET", "v1/client-hub/clients", {
      query: params.query,
      limit: params.limit !== undefined ? String(params.limit) : undefined,
    });
    return this.toResult(data);
  }

  async getClient360(params: GetClient360Params): Promise<McpToolResult> {
    const data = await this.api.request(
      "GET",
      `v1/client-hub/clients/${params.clientId}/360`
    );

    if (data === null) {
      return this.toResult({
        found: false,
        clientId: params.clientId,
        message:
          "No 360 data available for this client yet. The client may not have been materialized in the analytics mart.",
      });
    }

    return this.toResult(data);
  }

  async listLinks(params: ListLinksParams): Promise<McpToolResult> {
    const data = await this.api.request(
      "GET",
      `v1/client-hub/clients/${params.clientId}/links`
    );
    return this.toResult(data);
  }

  async searchConversations(
    params: SearchConversationsParams
  ): Promise<McpToolResult> {
    const data = await this.api.request(
      "GET",
      `v1/client-hub/clients/${params.clientId}/conversations/search`,
      {
        query: params.query,
        source: params.source,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      }
    );
    return this.toResult(data);
  }
}
