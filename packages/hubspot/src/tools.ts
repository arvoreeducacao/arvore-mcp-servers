import { HubSpotClient } from "./hubspot-client.js";
import {
  ListObjectsParams,
  GetObjectParams,
  CreateObjectParams,
  UpdateObjectParams,
  DeleteObjectParams,
  SearchObjectsParams,
  BatchReadParams,
  ListAssociationsParams,
  CreateAssociationParams,
  DeleteAssociationParams,
  ListPipelinesParams,
  ListPropertiesParams,
  ListInboxesParams,
  ListThreadsParams,
  GetThreadParams,
  ListThreadMessagesParams,
  SendThreadMessageParams,
  UpdateThreadParams,
  McpToolResult,
  HubSpotMCPError,
} from "./types.js";

export class HubSpotMCPTools {
  constructor(private readonly client: HubSpotClient) {}

  async listObjects(params: ListObjectsParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        limit: String(params.limit ?? 20),
        archived: String(params.archived ?? false),
      };
      if (params.after) query.after = params.after;
      if (params.properties?.length) query.properties = params.properties;
      if (params.associations?.length) query.associations = params.associations;

      const data = await this.client.request<unknown>(
        "GET",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getObject(params: GetObjectParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        archived: String(params.archived ?? false),
      };
      if (params.idProperty) query.idProperty = params.idProperty;
      if (params.properties?.length) query.properties = params.properties;
      if (params.associations?.length) query.associations = params.associations;

      const data = await this.client.request<unknown>(
        "GET",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}/${encodeURIComponent(params.objectId)}`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createObject(params: CreateObjectParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = { properties: params.properties };
      if (params.associations?.length) {
        body.associations = params.associations.map((assoc) => ({
          to: { id: assoc.toObjectId },
          types: [
            {
              associationCategory: assoc.associationCategory ?? "HUBSPOT_DEFINED",
              associationTypeId: assoc.associationTypeId,
            },
          ],
        }));
      }

      const data = await this.client.request<unknown>(
        "POST",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async updateObject(params: UpdateObjectParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {};
      if (params.idProperty) query.idProperty = params.idProperty;

      const data = await this.client.request<unknown>(
        "PATCH",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}/${encodeURIComponent(params.objectId)}`,
        { properties: params.properties },
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteObject(params: DeleteObjectParams): Promise<McpToolResult> {
    try {
      await this.client.request<unknown>(
        "DELETE",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}/${encodeURIComponent(params.objectId)}`
      );
      return this.ok({
        success: true,
        message: `${params.objectType} ${params.objectId} archived.`,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async searchObjects(params: SearchObjectsParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {
        limit: params.limit ?? 20,
      };
      if (params.query) body.query = params.query;
      if (params.filterGroups?.length) body.filterGroups = params.filterGroups;
      if (params.properties?.length) body.properties = params.properties;
      if (params.sorts?.length) body.sorts = params.sorts;
      if (params.after) body.after = params.after;

      const data = await this.client.request<unknown>(
        "POST",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}/search`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async batchReadObjects(params: BatchReadParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {
        inputs: params.ids.map((id) => ({ id })),
      };
      if (params.idProperty) body.idProperty = params.idProperty;
      if (params.properties?.length) body.properties = params.properties;

      const data = await this.client.request<unknown>(
        "POST",
        `/crm/v3/objects/${encodeURIComponent(params.objectType)}/batch/read`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listAssociations(params: ListAssociationsParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        limit: String(params.limit ?? 100),
      };
      if (params.after) query.after = params.after;

      const data = await this.client.request<unknown>(
        "GET",
        `/crm/v4/objects/${encodeURIComponent(params.fromObjectType)}/${encodeURIComponent(
          params.fromObjectId
        )}/associations/${encodeURIComponent(params.toObjectType)}`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createAssociation(params: CreateAssociationParams): Promise<McpToolResult> {
    try {
      const basePath = `/crm/v4/objects/${encodeURIComponent(params.fromObjectType)}/${encodeURIComponent(
        params.fromObjectId
      )}/associations`;

      if (params.types?.length) {
        const data = await this.client.request<unknown>(
          "PUT",
          `${basePath}/${encodeURIComponent(params.toObjectType)}/${encodeURIComponent(params.toObjectId)}`,
          params.types.map((type) => ({
            associationCategory: type.associationCategory ?? "HUBSPOT_DEFINED",
            associationTypeId: type.associationTypeId,
          }))
        );
        return this.ok(data);
      }

      const data = await this.client.request<unknown>(
        "PUT",
        `${basePath}/default/${encodeURIComponent(params.toObjectType)}/${encodeURIComponent(params.toObjectId)}`
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteAssociation(params: DeleteAssociationParams): Promise<McpToolResult> {
    try {
      await this.client.request<unknown>(
        "DELETE",
        `/crm/v4/objects/${encodeURIComponent(params.fromObjectType)}/${encodeURIComponent(
          params.fromObjectId
        )}/associations/${encodeURIComponent(params.toObjectType)}/${encodeURIComponent(params.toObjectId)}`
      );
      return this.ok({
        success: true,
        message: `Association ${params.fromObjectType}:${params.fromObjectId} -> ${params.toObjectType}:${params.toObjectId} removed.`,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listPipelines(params: ListPipelinesParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "GET",
        `/crm/v3/pipelines/${encodeURIComponent(params.objectType)}`
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listProperties(params: ListPropertiesParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        archived: String(params.archived ?? false),
      };
      const data = await this.client.request<unknown>(
        "GET",
        `/crm/v3/properties/${encodeURIComponent(params.objectType)}`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listInboxes(params: ListInboxesParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        limit: String(params.limit ?? 20),
      };
      if (params.after) query.after = params.after;

      const data = await this.client.request<unknown>(
        "GET",
        "/conversations/v3/conversations/inboxes",
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listThreads(params: ListThreadsParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        limit: String(params.limit ?? 20),
      };
      if (params.after) query.after = params.after;
      if (params.inboxId) query.inboxId = params.inboxId;
      if (params.threadStatus) query.threadStatus = params.threadStatus;
      if (params.sort) query.sort = params.sort;

      const data = await this.client.request<unknown>(
        "GET",
        "/conversations/v3/conversations/threads",
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getThread(params: GetThreadParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "GET",
        `/conversations/v3/conversations/threads/${encodeURIComponent(params.threadId)}`
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listThreadMessages(params: ListThreadMessagesParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string | string[]> = {
        limit: String(params.limit ?? 20),
      };
      if (params.after) query.after = params.after;

      const data = await this.client.request<unknown>(
        "GET",
        `/conversations/v3/conversations/threads/${encodeURIComponent(params.threadId)}/messages`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async sendThreadMessage(params: SendThreadMessageParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {
        type: "MESSAGE",
        text: params.text,
        richText: params.richText ?? params.text,
        senderActorId: params.senderActorId,
        channelId: params.channelId,
        channelAccountId: params.channelAccountId,
      };
      if (params.subject) body.subject = params.subject;

      const data = await this.client.request<unknown>(
        "POST",
        `/conversations/v3/conversations/threads/${encodeURIComponent(params.threadId)}/messages`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async updateThread(params: UpdateThreadParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.status !== undefined) body.status = params.status;
      if (params.archived !== undefined) body.archived = params.archived;

      const data = await this.client.request<unknown>(
        "PATCH",
        `/conversations/v3/conversations/threads/${encodeURIComponent(params.threadId)}`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    let message: string;
    if (error instanceof HubSpotMCPError) {
      message = `HubSpot Error: ${error.message}`;
    } else if (error instanceof Error) {
      message = `Unexpected error: ${error.message}`;
    } else {
      message = "Unexpected error: Unknown error";
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
