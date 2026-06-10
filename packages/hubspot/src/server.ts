import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HubSpotClient } from "./hubspot-client.js";
import { HubSpotMCPTools } from "./tools.js";
import {
  ListObjectsParamsSchema,
  GetObjectParamsSchema,
  CreateObjectParamsSchema,
  UpdateObjectParamsSchema,
  DeleteObjectParamsSchema,
  SearchObjectsParamsSchema,
  BatchReadParamsSchema,
  ListAssociationsParamsSchema,
  CreateAssociationParamsSchema,
  DeleteAssociationParamsSchema,
  ListPipelinesParamsSchema,
  ListPropertiesParamsSchema,
  ListInboxesParamsSchema,
  ListThreadsParamsSchema,
  GetThreadParamsSchema,
  ListThreadMessagesParamsSchema,
  SendThreadMessageParamsSchema,
  UpdateThreadParamsSchema,
} from "./types.js";

export class HubSpotMCPServer {
  private readonly server: McpServer;
  private readonly tools: HubSpotMCPTools;
  private readonly readOnly: boolean;

  constructor() {
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Missing required env var: HUBSPOT_ACCESS_TOKEN");
    }

    this.readOnly = process.env.HUBSPOT_READ_ONLY !== "false";

    this.server = new McpServer({
      name: "hubspot-mcp-server",
      version: "1.0.0",
    });

    const client = new HubSpotClient(accessToken);
    this.tools = new HubSpotMCPTools(client);

    this.setupReadTools();
    if (!this.readOnly) {
      this.setupWriteTools();
    }
  }

  private setupReadTools(): void {
    this.server.registerTool(
      "list_objects",
      {
        title: "List CRM Objects",
        description:
          "List records of any CRM object type (contacts, companies, deals, tickets, notes, tasks, calls, emails, meetings, or custom). Supports pagination.",
        inputSchema: ListObjectsParamsSchema.shape,
      },
      async (params) => this.tools.listObjects(ListObjectsParamsSchema.parse(params))
    );

    this.server.registerTool(
      "get_object",
      {
        title: "Get CRM Object",
        description: "Get a single CRM record by ID (or by a unique idProperty), optionally with properties and associations.",
        inputSchema: GetObjectParamsSchema.shape,
      },
      async (params) => this.tools.getObject(GetObjectParamsSchema.parse(params))
    );

    this.server.registerTool(
      "search_objects",
      {
        title: "Search CRM Objects",
        description:
          "Search CRM records with filterGroups (up to 6, OR between groups, AND within a group), free-text query, sorting and pagination.",
        inputSchema: SearchObjectsParamsSchema.shape,
      },
      async (params) => this.tools.searchObjects(SearchObjectsParamsSchema.parse(params))
    );

    this.server.registerTool(
      "batch_read_objects",
      {
        title: "Batch Read CRM Objects",
        description: "Read up to 100 CRM records in a single request by ID or unique idProperty.",
        inputSchema: BatchReadParamsSchema.shape,
      },
      async (params) => this.tools.batchReadObjects(BatchReadParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_associations",
      {
        title: "List Associations",
        description: "List associated records of a target object type for a given source record (v4 associations API).",
        inputSchema: ListAssociationsParamsSchema.shape,
      },
      async (params) => this.tools.listAssociations(ListAssociationsParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_pipelines",
      {
        title: "List Pipelines",
        description: "List pipelines and their stages for an object type (e.g. deals, tickets).",
        inputSchema: ListPipelinesParamsSchema.shape,
      },
      async (params) => this.tools.listPipelines(ListPipelinesParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_properties",
      {
        title: "List Properties",
        description: "List all property definitions for an object type to discover field names, types and options.",
        inputSchema: ListPropertiesParamsSchema.shape,
      },
      async (params) => this.tools.listProperties(ListPropertiesParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_inboxes",
      {
        title: "List Conversation Inboxes",
        description: "List conversations inboxes available in the account.",
        inputSchema: ListInboxesParamsSchema.shape,
      },
      async (params) => this.tools.listInboxes(ListInboxesParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_threads",
      {
        title: "List Conversation Threads",
        description: "List conversation threads, optionally filtered by inbox and status.",
        inputSchema: ListThreadsParamsSchema.shape,
      },
      async (params) => this.tools.listThreads(ListThreadsParamsSchema.parse(params))
    );

    this.server.registerTool(
      "get_thread",
      {
        title: "Get Conversation Thread",
        description: "Get a single conversation thread by ID.",
        inputSchema: GetThreadParamsSchema.shape,
      },
      async (params) => this.tools.getThread(GetThreadParamsSchema.parse(params))
    );

    this.server.registerTool(
      "list_thread_messages",
      {
        title: "List Thread Messages",
        description: "Get the message history for a conversation thread.",
        inputSchema: ListThreadMessagesParamsSchema.shape,
      },
      async (params) => this.tools.listThreadMessages(ListThreadMessagesParamsSchema.parse(params))
    );
  }

  private setupWriteTools(): void {
    this.server.registerTool(
      "create_object",
      {
        title: "Create CRM Object",
        description:
          "Create a CRM record (contact, company, deal, ticket, note, task, call, email, meeting, or custom) with properties and optional associations.",
        inputSchema: CreateObjectParamsSchema.shape,
      },
      async (params) => this.tools.createObject(CreateObjectParamsSchema.parse(params))
    );

    this.server.registerTool(
      "update_object",
      {
        title: "Update CRM Object",
        description: "Update a CRM record's properties by ID (or by a unique idProperty).",
        inputSchema: UpdateObjectParamsSchema.shape,
      },
      async (params) => this.tools.updateObject(UpdateObjectParamsSchema.parse(params))
    );

    this.server.registerTool(
      "delete_object",
      {
        title: "Delete CRM Object",
        description: "Archive (soft-delete) a CRM record by ID.",
        inputSchema: DeleteObjectParamsSchema.shape,
      },
      async (params) => this.tools.deleteObject(DeleteObjectParamsSchema.parse(params))
    );

    this.server.registerTool(
      "create_association",
      {
        title: "Create Association",
        description:
          "Associate two records. Omit types for a default (unlabeled) association, or provide associationTypeId(s) for labeled associations.",
        inputSchema: CreateAssociationParamsSchema.shape,
      },
      async (params) => this.tools.createAssociation(CreateAssociationParamsSchema.parse(params))
    );

    this.server.registerTool(
      "delete_association",
      {
        title: "Delete Association",
        description: "Remove all associations between two specific records.",
        inputSchema: DeleteAssociationParamsSchema.shape,
      },
      async (params) => this.tools.deleteAssociation(DeleteAssociationParamsSchema.parse(params))
    );

    this.server.registerTool(
      "send_thread_message",
      {
        title: "Send Thread Message",
        description:
          "Send an outbound message to a conversation thread through an existing channel. Requires senderActorId, channelId and channelAccountId.",
        inputSchema: SendThreadMessageParamsSchema.shape,
      },
      async (params) => this.tools.sendThreadMessage(SendThreadMessageParamsSchema.parse(params))
    );

    this.server.registerTool(
      "update_thread",
      {
        title: "Update Conversation Thread",
        description: "Update a conversation thread's status (OPEN/CLOSED) or archived flag.",
        inputSchema: UpdateThreadParamsSchema.shape,
      },
      async (params) => this.tools.updateThread(UpdateThreadParamsSchema.parse(params))
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error(
        `✅ HubSpot MCP Server started (${this.readOnly ? "read-only" : "read-write"} mode)`
      );
    } catch (error) {
      console.error(
        "Failed to start HubSpot MCP Server:",
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
