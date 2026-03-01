import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SendGridClient } from "./sendgrid-client.js";
import { SendGridMCPTools } from "./tools.js";
import {
  ListTemplatesParamsSchema,
  GetTemplateParamsSchema,
  CreateTemplateParamsSchema,
  UpdateTemplateParamsSchema,
  DeleteTemplateParamsSchema,
  CreateVersionParamsSchema,
  GetVersionParamsSchema,
  UpdateVersionParamsSchema,
  DeleteVersionParamsSchema,
  ActivateVersionParamsSchema,
} from "./types.js";

export class SendGridMCPServer {
  private readonly server: McpServer;
  private readonly tools: SendGridMCPTools;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var: SENDGRID_API_KEY");
    }

    this.server = new McpServer({
      name: "sendgrid-mcp-server",
      version: "1.0.0",
    });

    const client = new SendGridClient(apiKey);
    this.tools = new SendGridMCPTools(client);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool("list_templates", {
      title: "List Dynamic Templates",
      description: "List all SendGrid dynamic templates with pagination",
      inputSchema: ListTemplatesParamsSchema.shape,
    }, async (params) => {
      return this.tools.listTemplates(ListTemplatesParamsSchema.parse(params));
    });

    this.server.registerTool("get_template", {
      title: "Get Template",
      description: "Get a specific dynamic template by ID, including its versions",
      inputSchema: GetTemplateParamsSchema.shape,
    }, async (params) => {
      return this.tools.getTemplate(GetTemplateParamsSchema.parse(params));
    });

    this.server.registerTool("create_template", {
      title: "Create Template",
      description: "Create a new dynamic template",
      inputSchema: CreateTemplateParamsSchema.shape,
    }, async (params) => {
      return this.tools.createTemplate(CreateTemplateParamsSchema.parse(params));
    });

    this.server.registerTool("update_template", {
      title: "Update Template",
      description: "Update a dynamic template's name",
      inputSchema: UpdateTemplateParamsSchema.shape,
    }, async (params) => {
      return this.tools.updateTemplate(UpdateTemplateParamsSchema.parse(params));
    });

    this.server.registerTool("delete_template", {
      title: "Delete Template",
      description: "Delete a dynamic template and all its versions",
      inputSchema: DeleteTemplateParamsSchema.shape,
    }, async (params) => {
      return this.tools.deleteTemplate(DeleteTemplateParamsSchema.parse(params));
    });

    this.server.registerTool("create_version", {
      title: "Create Template Version",
      description: "Create a new version for a dynamic template with HTML content, subject, etc.",
      inputSchema: CreateVersionParamsSchema.shape,
    }, async (params) => {
      return this.tools.createVersion(CreateVersionParamsSchema.parse(params));
    });

    this.server.registerTool("get_version", {
      title: "Get Template Version",
      description: "Get a specific version of a dynamic template",
      inputSchema: GetVersionParamsSchema.shape,
    }, async (params) => {
      return this.tools.getVersion(GetVersionParamsSchema.parse(params));
    });

    this.server.registerTool("update_version", {
      title: "Update Template Version",
      description: "Update a version's content (HTML, subject, plain text, active status)",
      inputSchema: UpdateVersionParamsSchema.shape,
    }, async (params) => {
      return this.tools.updateVersion(UpdateVersionParamsSchema.parse(params));
    });

    this.server.registerTool("delete_version", {
      title: "Delete Template Version",
      description: "Delete a specific version of a dynamic template",
      inputSchema: DeleteVersionParamsSchema.shape,
    }, async (params) => {
      return this.tools.deleteVersion(DeleteVersionParamsSchema.parse(params));
    });

    this.server.registerTool("activate_version", {
      title: "Activate Template Version",
      description: "Activate a specific version of a dynamic template",
      inputSchema: ActivateVersionParamsSchema.shape,
    }, async (params) => {
      return this.tools.activateVersion(ActivateVersionParamsSchema.parse(params));
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("✅ SendGrid MCP Server started");
    } catch (error) {
      console.error(
        "Failed to start SendGrid MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
