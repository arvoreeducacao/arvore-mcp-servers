import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GupyClient } from "./gupy-client.js";
import { GupyMCPTools } from "./tools.js";
import {
  RawRequestParamsSchema,
  ListJobsParamsSchema,
  GetJobParamsSchema,
  UpdateJobStatusParamsSchema,
  ListApplicationsParamsSchema,
  ListApplicationExperiencesParamsSchema,
  MoveApplicationParamsSchema,
  CreateApplicationCommentParamsSchema,
  ListApplicationCommentsParamsSchema,
  TagApplicationParamsSchema,
  ListApplicationTagsParamsSchema,
  DeleteApplicationTagParamsSchema,
  SendCandidateMessageParamsSchema,
  ListCandidatesParamsSchema,
  ListWebhooksParamsSchema,
  CreateWebhookParamsSchema,
  DeleteWebhookParamsSchema,
} from "./types.js";

export class GupyMCPServer {
  private readonly server: McpServer;
  private readonly tools: GupyMCPTools;

  constructor() {
    const apiToken = process.env.GUPY_API_TOKEN;
    if (!apiToken) {
      throw new Error("Missing required env var: GUPY_API_TOKEN");
    }

    const baseUrl = process.env.GUPY_API_URL ?? "https://api.gupy.io";

    this.server = new McpServer({
      name: "gupy-mcp-server",
      version: "1.2.0",
    });

    const client = new GupyClient(apiToken, baseUrl);
    this.tools = new GupyMCPTools(client);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "gupy_request",
      {
        title: "Raw Gupy API Request",
        description:
          "Make an authenticated request to any Gupy Public API endpoint. Use this for endpoints not covered by the typed tools. Reference: https://developers.gupy.io/reference",
        inputSchema: RawRequestParamsSchema.shape,
      },
      async (params) => {
        return this.tools.rawRequest(RawRequestParamsSchema.parse(params));
      }
    );

    this.server.registerTool(
      "list_jobs",
      {
        title: "List Jobs",
        description: "List jobs with optional filters (status, code, name)",
        inputSchema: ListJobsParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listJobs(ListJobsParamsSchema.parse(params));
      }
    );

    this.server.registerTool(
      "get_job",
      {
        title: "Get Job",
        description: "Retrieve details of a specific job by ID",
        inputSchema: GetJobParamsSchema.shape,
      },
      async (params) => {
        return this.tools.getJob(GetJobParamsSchema.parse(params));
      }
    );

    this.server.registerTool(
      "update_job_status",
      {
        title: "Update Job Status",
        description:
          "Update the status of a job (publish, suspend, close, etc.). See https://developers.gupy.io/docs/mudanças-de-estado-de-uma-vaga",
        inputSchema: UpdateJobStatusParamsSchema.shape,
      },
      async (params) => {
        return this.tools.updateJobStatus(
          UpdateJobStatusParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_applications",
      {
        title: "List Applications",
        description:
          "List candidate applications for a specific job, with optional step/status filters. Use fields='all' to include candidate details such as work experience, education and languages.",
        inputSchema: ListApplicationsParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listApplications(
          ListApplicationsParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_application_experiences",
      {
        title: "List Application Professional Experiences",
        description:
          "List the professional (work) experiences of candidates who applied to a specific job. Returns each candidate's name, email, schooling, work experiences (role, company, activities, period), academic qualifications (course, institution, period), languages (idiom + level) and additionalQuestions (custom registration questions/answers). Internally queries the applications endpoint with fields=all.",
        inputSchema: ListApplicationExperiencesParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listApplicationExperiences(
          ListApplicationExperiencesParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "move_application",
      {
        title: "Move Application",
        description:
          "Move a candidate application to a different step (and optionally set a status within the step)",
        inputSchema: MoveApplicationParamsSchema.shape,
      },
      async (params) => {
        return this.tools.moveApplication(
          MoveApplicationParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "create_application_comment",
      {
        title: "Create Application Comment",
        description:
          "Add a comment to a candidate's timeline on a specific job application",
        inputSchema: CreateApplicationCommentParamsSchema.shape,
      },
      async (params) => {
        return this.tools.createApplicationComment(
          CreateApplicationCommentParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_application_comments",
      {
        title: "List Application Comments",
        description: "List comments on a candidate's timeline for a job application",
        inputSchema: ListApplicationCommentsParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listApplicationComments(
          ListApplicationCommentsParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "tag_application",
      {
        title: "Tag Application",
        description:
          "Add one or more tags to a candidate application. Each tag is created by name (max 120 chars) via a separate PUT call, as required by the Gupy API. There is no global tag catalog: a tag exists once applied by name. Returns a per-tag result with created/failed counts.",
        inputSchema: TagApplicationParamsSchema.shape,
      },
      async (params) => {
        return this.tools.tagApplication(
          TagApplicationParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_application_tags",
      {
        title: "List Application Tags",
        description:
          "List the tags already applied to a specific candidate application (optionally filtered by name). Note: the Gupy public API has no global tag catalog; tags can only be listed per application.",
        inputSchema: ListApplicationTagsParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listApplicationTags(
          ListApplicationTagsParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "delete_application_tag",
      {
        title: "Delete Application Tag",
        description:
          "Remove a tag from a candidate application by its name (value). Useful to fix tags applied by mistake.",
        inputSchema: DeleteApplicationTagParamsSchema.shape,
      },
      async (params) => {
        return this.tools.deleteApplicationTag(
          DeleteApplicationTagParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "send_candidate_message",
      {
        title: "Send Candidate Email",
        description:
          "Create and send an email to the candidate of a specific application",
        inputSchema: SendCandidateMessageParamsSchema.shape,
      },
      async (params) => {
        return this.tools.sendCandidateMessage(
          SendCandidateMessageParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_candidates",
      {
        title: "List Candidates",
        description:
          "List candidates registered on Gupy. Filter by email or by whether they were manually added.",
        inputSchema: ListCandidatesParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listCandidates(
          ListCandidatesParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "list_webhooks",
      {
        title: "List Webhooks",
        description: "List webhook configurations",
        inputSchema: ListWebhooksParamsSchema.shape,
      },
      async (params) => {
        return this.tools.listWebhooks(ListWebhooksParamsSchema.parse(params));
      }
    );

    this.server.registerTool(
      "create_webhook",
      {
        title: "Create Webhook",
        description:
          "Configure a new webhook for a given event (e.g. application.created, candidate.hired)",
        inputSchema: CreateWebhookParamsSchema.shape,
      },
      async (params) => {
        return this.tools.createWebhook(
          CreateWebhookParamsSchema.parse(params)
        );
      }
    );

    this.server.registerTool(
      "delete_webhook",
      {
        title: "Delete Webhook",
        description: "Delete a webhook configuration by ID",
        inputSchema: DeleteWebhookParamsSchema.shape,
      },
      async (params) => {
        return this.tools.deleteWebhook(
          DeleteWebhookParamsSchema.parse(params)
        );
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("✅ Gupy MCP Server started");
    } catch (error) {
      console.error(
        "Failed to start Gupy MCP Server:",
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
