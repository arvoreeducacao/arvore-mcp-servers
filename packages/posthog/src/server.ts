import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PostHogClient, PostHogConfig } from "./posthog-client.js";

function result(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export class PostHogMCPServer {
  private server: McpServer;
  private client: PostHogClient;

  constructor(config: PostHogConfig) {
    this.server = new McpServer({
      name: "posthog-mcp-server",
      version: "1.0.0",
    });

    this.client = new PostHogClient(config);
    this.setupTools();
  }

  static fromEnvironment(): PostHogMCPServer {
    const baseUrl = process.env.POSTHOG_BASE_URL;
    const apiKey = process.env.POSTHOG_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;

    if (!baseUrl || !apiKey) {
      console.error(
        "POSTHOG_BASE_URL and POSTHOG_API_KEY environment variables are required"
      );
      process.exit(1);
    }

    return new PostHogMCPServer({ baseUrl, apiKey, projectId });
  }

  private setupTools(): void {
    this.server.registerTool(
      "list_projects",
      {
        title: "List Projects",
        description: "List all PostHog projects accessible with the current API key",
        inputSchema: {},
      },
      async () => {
        try {
          return result(await this.client.listProjects());
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_feature_flags",
      {
        title: "List Feature Flags",
        description:
          "List all feature flags in the project. Supports search and pagination.",
        inputSchema: {
          limit: z.number().optional().describe("Max results to return"),
          offset: z.number().optional().describe("Offset for pagination"),
          search: z.string().optional().describe("Search by flag key or name"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listFeatureFlags(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "get_feature_flag",
      {
        title: "Get Feature Flag",
        description: "Get details of a specific feature flag by ID",
        inputSchema: {
          id: z.number().describe("Feature flag ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.getFeatureFlag(params.id));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "create_feature_flag",
      {
        title: "Create Feature Flag",
        description: "Create a new feature flag",
        inputSchema: {
          key: z.string().describe("Unique key for the feature flag"),
          name: z.string().optional().describe("Human-readable name"),
          active: z.boolean().optional().describe("Whether the flag is active"),
          rollout_percentage: z
            .number()
            .min(0)
            .max(100)
            .optional()
            .describe("Percentage of users to roll out to (0-100)"),
        },
      },
      async (params) => {
        try {
          const data: Record<string, unknown> = { key: params.key };
          if (params.name) data.name = params.name;
          if (params.active !== undefined) data.active = params.active;
          if (params.rollout_percentage !== undefined) {
            data.filters = {
              groups: [
                {
                  properties: [],
                  rollout_percentage: params.rollout_percentage,
                },
              ],
            };
          }
          return result(await this.client.createFeatureFlag(data as any));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "update_feature_flag",
      {
        title: "Update Feature Flag",
        description: "Update an existing feature flag",
        inputSchema: {
          id: z.number().describe("Feature flag ID"),
          key: z.string().optional().describe("New key"),
          name: z.string().optional().describe("New name"),
          active: z.boolean().optional().describe("Enable or disable the flag"),
        },
      },
      async (params) => {
        try {
          const { id, ...data } = params;
          return result(await this.client.updateFeatureFlag(id, data));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "delete_feature_flag",
      {
        title: "Delete Feature Flag",
        description: "Delete a feature flag by ID",
        inputSchema: {
          id: z.number().describe("Feature flag ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.deleteFeatureFlag(params.id));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_experiments",
      {
        title: "List Experiments",
        description: "List all A/B test experiments",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listExperiments(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "get_experiment",
      {
        title: "Get Experiment",
        description:
          "Get details of a specific experiment including variants and metrics",
        inputSchema: {
          id: z.number().describe("Experiment ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.getExperiment(params.id));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_insights",
      {
        title: "List Insights",
        description: "List saved insights (trends, funnels, retention, etc.)",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
          search: z.string().optional().describe("Search by name"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listInsights(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "get_insight",
      {
        title: "Get Insight",
        description: "Get details of a specific insight by ID",
        inputSchema: {
          id: z.number().describe("Insight ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.getInsight(params.id));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "create_insight",
      {
        title: "Create Insight",
        description:
          "Create a new insight and optionally add it to dashboards. Supports TrendsQuery, FunnelsQuery, RetentionQuery, PathsQuery, StickinessQuery, LifecycleQuery via the query field.",
        inputSchema: {
          name: z.string().describe("Name of the insight"),
          description: z.string().optional().describe("Description"),
          query: z
            .record(z.unknown())
            .optional()
            .describe(
              "PostHog query object with 'kind' field (e.g. TrendsQuery, RetentionQuery)"
            ),
          dashboards: z
            .array(z.number())
            .optional()
            .describe("Dashboard IDs to add this insight to"),
          saved: z
            .boolean()
            .optional()
            .describe("Whether to save the insight (default true)"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.createInsight(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_dashboards",
      {
        title: "List Dashboards",
        description: "List all dashboards",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
          search: z.string().optional().describe("Search by name"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listDashboards(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "get_dashboard",
      {
        title: "Get Dashboard",
        description: "Get details of a specific dashboard including its tiles",
        inputSchema: {
          id: z.number().describe("Dashboard ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.getDashboard(params.id));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "execute_sql",
      {
        title: "Execute SQL (HogQL)",
        description:
          "Execute a HogQL query against PostHog data. HogQL is PostHog's SQL dialect that queries events, persons, groups, and more.",
        inputSchema: {
          query: z.string().describe("HogQL SQL query to execute"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.executeSql(params.query));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "execute_query",
      {
        title: "Execute Query",
        description:
          "Execute a PostHog query using the query API. Supports TrendsQuery, FunnelsQuery, RetentionQuery, PathsQuery, StickinessQuery, LifecycleQuery, and HogQLQuery.",
        inputSchema: {
          query: z
            .record(z.unknown())
            .describe(
              "PostHog query object. Must include 'kind' field (e.g. TrendsQuery, FunnelsQuery, HogQLQuery)"
            ),
        },
      },
      async (params) => {
        try {
          return result(await this.client.executeQuery(params.query));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_event_definitions",
      {
        title: "List Event Definitions",
        description: "List all event definitions (tracked event types)",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
          search: z.string().optional().describe("Search by event name"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listEventDefinitions(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_property_definitions",
      {
        title: "List Property Definitions",
        description: "List all property definitions (event or person properties)",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
          type: z
            .enum(["event", "person"])
            .optional()
            .describe("Filter by property type"),
          search: z.string().optional().describe("Search by property name"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listPropertyDefinitions(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_cohorts",
      {
        title: "List Cohorts",
        description: "List all cohorts (user segments)",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listCohorts(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_persons",
      {
        title: "List Persons",
        description: "List persons (users) with optional search",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
          search: z
            .string()
            .optional()
            .describe("Search by email, name, or distinct ID"),
          distinct_id: z
            .string()
            .optional()
            .describe("Filter by exact distinct ID"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listPersons(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_annotations",
      {
        title: "List Annotations",
        description: "List all annotations (markers on charts)",
        inputSchema: {
          limit: z.number().optional().describe("Max results"),
          offset: z.number().optional().describe("Offset for pagination"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.listAnnotations(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "create_annotation",
      {
        title: "Create Annotation",
        description: "Create a new annotation (marker on charts)",
        inputSchema: {
          content: z.string().describe("Annotation text"),
          date_marker: z
            .string()
            .describe("ISO date string for the annotation marker"),
          scope: z
            .enum(["project", "organization"])
            .optional()
            .describe("Scope of the annotation"),
        },
      },
      async (params) => {
        try {
          return result(await this.client.createAnnotation(params));
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_surveys",
      {
        title: "List Surveys",
        description: "List all surveys",
        inputSchema: {},
      },
      async () => {
        try {
          return result(await this.client.listSurveys());
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "list_early_access_features",
      {
        title: "List Early Access Features",
        description: "List all early access features",
        inputSchema: {},
      },
      async () => {
        try {
          return result(await this.client.listEarlyAccessFeatures());
        } catch (e) {
          return errorResult(e);
        }
      }
    );

    this.server.registerTool(
      "search",
      {
        title: "Search PostHog",
        description:
          "Search across PostHog entities (insights, dashboards, feature flags, experiments, cohorts, etc.)",
        inputSchema: {
          query: z.string().describe("Search query"),
          entities: z
            .array(z.string())
            .optional()
            .describe(
              "Entity types to search: insight, dashboard, experiment, feature_flag, cohort, notebook, action"
            ),
        },
      },
      async (params) => {
        try {
          return result(
            await this.client.search(params.query, params.entities)
          );
        } catch (e) {
          return errorResult(e);
        }
      }
    );
  }

  async start(): Promise<void> {
    try {
      const isConnected = await this.client.testConnection();
      if (!isConnected) {
        throw new Error(
          "PostHog API connection test failed. Check POSTHOG_BASE_URL and POSTHOG_API_KEY."
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("PostHog MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start PostHog MCP Server:",
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
