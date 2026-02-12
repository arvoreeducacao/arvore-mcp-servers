import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { D1DatabaseClient } from "./d1-client.js";
import { TempMailMCPTools } from "./tools.js";
import {
  CreateEmailAccountParamsSchema,
  ListEmailAccountsParamsSchema,
  DeleteEmailAccountParamsSchema,
  GetInboxParamsSchema,
  ReadEmailParamsSchema,
  DeleteEmailParamsSchema,
} from "./types.js";

export class TempMailMCPServer {
  private server: McpServer;
  private store: D1DatabaseClient;
  private tools: TempMailMCPTools;
  private domain: string;

  constructor() {
    this.domain = process.env.TEMPMAIL_DOMAIN || "tempmail.arvore.com.br";

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !databaseId || !apiToken) {
      throw new Error(
        "Missing required env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN"
      );
    }

    this.server = new McpServer({
      name: "tempmail-mcp-server",
      version: "2.0.0",
    });

    this.store = new D1DatabaseClient({ accountId, databaseId, apiToken });
    this.tools = new TempMailMCPTools(this.store, this.domain);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "get_domains",
      {
        title: "Get Available Domains",
        description:
          "Get the list of available email domains for creating temporary email accounts",
        inputSchema: {},
      },
      async () => {
        return this.tools.getDomains();
      }
    );

    this.server.registerTool(
      "create_email_account",
      {
        title: "Create Email Account",
        description:
          "Create a new temporary email account. Provide a username and the system will create an email address with the configured domain.",
        inputSchema: CreateEmailAccountParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = CreateEmailAccountParamsSchema.parse(params);
        return this.tools.createEmailAccount(validatedParams);
      }
    );

    this.server.registerTool(
      "list_email_accounts",
      {
        title: "List Email Accounts",
        description:
          "List all active temporary email accounts with pagination support",
        inputSchema: ListEmailAccountsParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = ListEmailAccountsParamsSchema.parse(params);
        return this.tools.listEmailAccounts(validatedParams);
      }
    );

    this.server.registerTool(
      "delete_email_account",
      {
        title: "Delete Email Account",
        description:
          "Delete a temporary email account and all its messages permanently",
        inputSchema: DeleteEmailAccountParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = DeleteEmailAccountParamsSchema.parse(params);
        return this.tools.deleteEmailAccount(validatedParams);
      }
    );

    this.server.registerTool(
      "get_inbox",
      {
        title: "Get Inbox",
        description:
          "Get the list of messages received by a specific email account with pagination",
        inputSchema: GetInboxParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = GetInboxParamsSchema.parse(params);
        return this.tools.getInbox(validatedParams);
      }
    );

    this.server.registerTool(
      "read_email",
      {
        title: "Read Email",
        description:
          "Read the full content of a specific email message including text and HTML body",
        inputSchema: ReadEmailParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = ReadEmailParamsSchema.parse(params);
        return this.tools.readEmail(validatedParams);
      }
    );

    this.server.registerTool(
      "delete_email",
      {
        title: "Delete Email",
        description: "Delete a specific email message permanently",
        inputSchema: DeleteEmailParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = DeleteEmailParamsSchema.parse(params);
        return this.tools.deleteEmail(validatedParams);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error(
        `✅ TempMail MCP Server started (domain: ${this.domain}, storage: Cloudflare D1)`
      );
    } catch (error) {
      console.error(
        "Failed to start TempMail MCP Server:",
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
