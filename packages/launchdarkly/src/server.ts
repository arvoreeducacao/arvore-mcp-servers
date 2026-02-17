import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LaunchDarklyClient } from "./launchdarkly-client.js";
import { LaunchDarklyMCPTools } from "./tools.js";
import {
  LaunchDarklyConfig,
  LaunchDarklyConfigSchema,
  ListFlagsParamsSchema,
  GetFlagParamsSchema,
  ToggleFlagParamsSchema,
  CreateFlagParamsSchema,
  SearchFlagsParamsSchema,
  ListProjectsParamsSchema,
  ListEnvironmentsParamsSchema,
  GetFlagStatusesParamsSchema,
  AddFlagRuleParamsSchema,
  UpdateFlagTargetingParamsSchema,
  DeleteFlagParamsSchema,
  ListSegmentsParamsSchema,
  GetSegmentParamsSchema,
} from "./types.js";

export class LaunchDarklyMCPServer {
  private server: McpServer;
  private client: LaunchDarklyClient;
  private tools: LaunchDarklyMCPTools;

  constructor(config: LaunchDarklyConfig) {
    this.server = new McpServer({
      name: "launchdarkly-mcp-server",
      version: "1.0.0",
    });

    this.client = new LaunchDarklyClient(config);
    this.tools = new LaunchDarklyMCPTools(this.client, config);

    this.setupTools();
  }

  static fromEnvironment(): LaunchDarklyMCPServer {
    const config = LaunchDarklyConfigSchema.parse({
      email: process.env.LAUNCHDARKLY_EMAIL,
      password: process.env.LAUNCHDARKLY_PASSWORD,
      baseUrl:
        process.env.LAUNCHDARKLY_BASE_URL || "https://app.launchdarkly.com",
      defaultProject: process.env.LAUNCHDARKLY_PROJECT || "default",
      defaultEnvironment: process.env.LAUNCHDARKLY_ENVIRONMENT || "production",
    });

    return new LaunchDarklyMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "list_flags",
      {
        title: "List Feature Flags",
        description:
          "List feature flags in a LaunchDarkly project. Returns flags sorted by creation date with their current status in the specified environment.",
        inputSchema: ListFlagsParamsSchema.shape,
      },
      async (params) => {
        const validated = ListFlagsParamsSchema.parse(params);
        return this.tools.listFlags(validated);
      }
    );

    this.server.registerTool(
      "get_flag",
      {
        title: "Get Feature Flag Details",
        description:
          "Get detailed information about a specific feature flag including variations, targeting rules, and environment configuration.",
        inputSchema: GetFlagParamsSchema.shape,
      },
      async (params) => {
        const validated = GetFlagParamsSchema.parse(params);
        return this.tools.getFlag(validated);
      }
    );

    this.server.registerTool(
      "toggle_flag",
      {
        title: "Toggle Feature Flag",
        description:
          "Turn a feature flag ON or OFF in a specific environment. Use with caution in production environments.",
        inputSchema: ToggleFlagParamsSchema.shape,
      },
      async (params) => {
        const validated = ToggleFlagParamsSchema.parse(params);
        return this.tools.toggleFlag(validated);
      }
    );

    this.server.registerTool(
      "create_flag",
      {
        title: "Create Feature Flag",
        description:
          "Create a new boolean feature flag in a LaunchDarkly project. The flag is created with true/false variations and starts OFF.",
        inputSchema: CreateFlagParamsSchema.shape,
      },
      async (params) => {
        const validated = CreateFlagParamsSchema.parse(params);
        return this.tools.createFlag(validated);
      }
    );

    this.server.registerTool(
      "search_flags",
      {
        title: "Search Feature Flags",
        description:
          "Search for feature flags by name or key in a LaunchDarkly project.",
        inputSchema: SearchFlagsParamsSchema.shape,
      },
      async (params) => {
        const validated = SearchFlagsParamsSchema.parse(params);
        return this.tools.searchFlags(validated);
      }
    );

    this.server.registerTool(
      "list_projects",
      {
        title: "List Projects",
        description:
          "List all available projects in LaunchDarkly with their environments.",
        inputSchema: ListProjectsParamsSchema.shape,
      },
      async () => {
        return this.tools.listProjects();
      }
    );

    this.server.registerTool(
      "list_environments",
      {
        title: "List Environments",
        description:
          "List all environments available in a LaunchDarkly project.",
        inputSchema: ListEnvironmentsParamsSchema.shape,
      },
      async (params) => {
        const validated = ListEnvironmentsParamsSchema.parse(params);
        return this.tools.listEnvironments(validated);
      }
    );

    this.server.registerTool(
      "get_flag_statuses",
      {
        title: "Get Flag Statuses",
        description:
          "Get the status (active, inactive, launched, etc.) of specific feature flags in given environments.",
        inputSchema: GetFlagStatusesParamsSchema.shape,
      },
      async (params) => {
        const validated = GetFlagStatusesParamsSchema.parse(params);
        return this.tools.getFlagStatuses(validated);
      }
    );

    this.server.registerTool(
      "add_flag_rule",
      {
        title: "Add Targeting Rule",
        description:
          "Add a targeting rule to a feature flag. A rule consists of clauses (conditions) that determine which contexts receive a specific variation. Example: target users where 'access_token' is in ['TOKEN123'] to serve variation 0 (true).",
        inputSchema: AddFlagRuleParamsSchema.shape,
      },
      async (params) => {
        const validated = AddFlagRuleParamsSchema.parse(params);
        return this.tools.addFlagRule(validated);
      }
    );

    this.server.registerTool(
      "update_flag_targeting",
      {
        title: "Update Flag Targeting",
        description:
          "Send raw semantic patch instructions to update a flag's targeting configuration. This is a low-level tool for advanced operations like removing rules, updating fallthrough, adding individual targets, etc. Each instruction must have a 'kind' field.",
        inputSchema: UpdateFlagTargetingParamsSchema.shape,
      },
      async (params) => {
        const validated = UpdateFlagTargetingParamsSchema.parse(params);
        return this.tools.updateFlagTargeting(validated);
      }
    );

    this.server.registerTool(
      "delete_flag",
      {
        title: "Delete Feature Flag",
        description:
          "Permanently delete a feature flag from a project. This action cannot be undone.",
        inputSchema: DeleteFlagParamsSchema.shape,
      },
      async (params) => {
        const validated = DeleteFlagParamsSchema.parse(params);
        return this.tools.deleteFlag(validated);
      }
    );

    this.server.registerTool(
      "list_segments",
      {
        title: "List Segments",
        description:
          "List user segments in a LaunchDarkly project/environment. Segments are reusable groups of contexts that can be targeted by feature flags.",
        inputSchema: ListSegmentsParamsSchema.shape,
      },
      async (params) => {
        const validated = ListSegmentsParamsSchema.parse(params);
        return this.tools.listSegments(validated);
      }
    );

    this.server.registerTool(
      "get_segment",
      {
        title: "Get Segment Details",
        description:
          "Get detailed information about a specific segment including its targeting rules, included/excluded contexts.",
        inputSchema: GetSegmentParamsSchema.shape,
      },
      async (params) => {
        const validated = GetSegmentParamsSchema.parse(params);
        return this.tools.getSegment(validated);
      }
    );
  }

  async start(): Promise<void> {
    try {
      console.error("Authenticating with LaunchDarkly...");
      await this.client.authenticate();

      const connected = await this.client.testConnection();
      if (!connected) {
        throw new Error(
          "Failed to connect to LaunchDarkly API after authentication"
        );
      }

      console.error("LaunchDarkly connection verified");

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("LaunchDarkly MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start LaunchDarkly MCP Server:",
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
