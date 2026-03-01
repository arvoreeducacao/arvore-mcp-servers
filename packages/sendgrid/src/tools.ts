import { SendGridClient } from "./sendgrid-client.js";
import {
  ListTemplatesParams,
  GetTemplateParams,
  CreateTemplateParams,
  UpdateTemplateParams,
  DeleteTemplateParams,
  CreateVersionParams,
  GetVersionParams,
  UpdateVersionParams,
  DeleteVersionParams,
  ActivateVersionParams,
  McpToolResult,
  SendGridMCPError,
} from "./types.js";

export class SendGridMCPTools {
  constructor(private readonly client: SendGridClient) {}

  async listTemplates(params: ListTemplatesParams): Promise<McpToolResult> {
    try {
      const query: Record<string, string> = {
        generations: params.generations ?? "dynamic",
        page_size: String(params.pageSize ?? 20),
      };
      if (params.pageToken) {
        query.page_token = params.pageToken;
      }

      const data = await this.client.request<unknown>("GET", "/templates", undefined, query);
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getTemplate(params: GetTemplateParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>("GET", `/templates/${params.templateId}`);
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createTemplate(params: CreateTemplateParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>("POST", "/templates", {
        name: params.name,
        generation: params.generation ?? "dynamic",
      });
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async updateTemplate(params: UpdateTemplateParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "PATCH",
        `/templates/${params.templateId}`,
        { name: params.name }
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteTemplate(params: DeleteTemplateParams): Promise<McpToolResult> {
    try {
      await this.client.request<unknown>("DELETE", `/templates/${params.templateId}`);
      return this.ok({ success: true, message: `Template ${params.templateId} deleted.` });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createVersion(params: CreateVersionParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {
        name: params.name,
        subject: params.subject,
        active: params.active ?? 1,
      };
      if (params.htmlContent) body.html_content = params.htmlContent;
      if (params.plainContent) body.plain_content = params.plainContent;

      const data = await this.client.request<unknown>(
        "POST",
        `/templates/${params.templateId}/versions`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getVersion(params: GetVersionParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "GET",
        `/templates/${params.templateId}/versions/${params.versionId}`
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async updateVersion(params: UpdateVersionParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {};
      if (params.name !== undefined) body.name = params.name;
      if (params.subject !== undefined) body.subject = params.subject;
      if (params.htmlContent !== undefined) body.html_content = params.htmlContent;
      if (params.plainContent !== undefined) body.plain_content = params.plainContent;
      if (params.active !== undefined) body.active = params.active;

      const data = await this.client.request<unknown>(
        "PATCH",
        `/templates/${params.templateId}/versions/${params.versionId}`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteVersion(params: DeleteVersionParams): Promise<McpToolResult> {
    try {
      await this.client.request<unknown>(
        "DELETE",
        `/templates/${params.templateId}/versions/${params.versionId}`
      );
      return this.ok({
        success: true,
        message: `Version ${params.versionId} of template ${params.templateId} deleted.`,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async activateVersion(params: ActivateVersionParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "POST",
        `/templates/${params.templateId}/versions/${params.versionId}/activate`
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
    if (error instanceof SendGridMCPError) {
      message = `SendGrid Error: ${error.message}`;
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
