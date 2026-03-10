import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TeammateStore } from "./store.js";
import { z } from "zod";

export class TeammateMCPServer {
  private server: McpServer;
  private store: TeammateStore;
  private teammateId: string;
  private teammateName: string;

  constructor(workspacePath: string, teammateId: string, teammateName: string) {
    this.server = new McpServer({
      name: "agent-teams-teammate",
      version: "0.1.0",
    });

    this.store = new TeammateStore(workspacePath);
    this.teammateId = teammateId;
    this.teammateName = teammateName;

    this.setupTools();
  }

  private ok(data: Record<string, unknown>) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }

  private err(error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    };
  }

  private setupTools(): void {
    this.server.registerTool(
      "whoami",
      {
        title: "Who Am I",
        description: "Returns your identity: name, role, team objective.",
        inputSchema: z.object({}).shape,
      },
      async () => {
        try {
          await this.store.load();
          const team = this.store.getTeam();
          const teammate = this.store.getTeammate(this.teammateId);
          return this.ok({
            id: this.teammateId,
            name: this.teammateName,
            role: teammate?.role || "unknown",
            team_objective: team?.objective || "unknown",
            teammates: team?.teammates
              .filter((t) => t.id !== this.teammateId && t.status === "active")
              .map((t) => ({ id: t.id, name: t.name, role: t.role })) || [],
          });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "list_tasks",
      {
        title: "List Tasks",
        description: "List available tasks. Filter by status (pending, in_progress, completed, blocked).",
        inputSchema: z.object({
          status: z.string().optional(),
        }).shape,
      },
      async (params) => {
        try {
          await this.store.load();
          const tasks = this.store.listTasks(params.status ? { status: params.status } : undefined);
          return this.ok({
            count: tasks.length,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description,
              status: t.status,
              assigned_to: t.assigned_to,
              depends_on: t.depends_on,
              acceptance_criteria: t.acceptance_criteria,
            })),
          });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "claim_task",
      {
        title: "Claim Task",
        description: "Claim a pending task to work on it. The task must be pending and have no unresolved dependencies.",
        inputSchema: z.object({
          task_id: z.string().min(1),
        }).shape,
      },
      async (params) => {
        try {
          const task = await this.store.claimTask(params.task_id, this.teammateId);
          return this.ok({ claimed: true, task_id: task.id, title: task.title });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "update_task",
      {
        title: "Update Task",
        description: "Update a task you own. Change status or add a note.",
        inputSchema: z.object({
          task_id: z.string().min(1),
          status: z.enum(["in_progress", "blocked"]).optional(),
          note: z.string().optional(),
        }).shape,
      },
      async (params) => {
        try {
          const task = await this.store.updateTask(params.task_id, this.teammateId, {
            status: params.status,
            note: params.note,
          });
          return this.ok({ updated: true, task_id: task.id, status: task.status });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "complete_task",
      {
        title: "Complete Task",
        description: "Mark a task as completed with a summary of what was done.",
        inputSchema: z.object({
          task_id: z.string().min(1),
          summary: z.string().min(1),
          touched_paths: z.array(z.string()).optional().default([]),
        }).shape,
      },
      async (params) => {
        try {
          const task = await this.store.completeTask(params.task_id, this.teammateId, {
            summary: params.summary,
            touched_paths: params.touched_paths,
          });
          return this.ok({ completed: true, task_id: task.id, title: task.title });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "send_message",
      {
        title: "Send Message",
        description: "Send a message to another teammate or to the lead.",
        inputSchema: z.object({
          to: z.string().optional(),
          to_lead: z.boolean().optional().default(false),
          subject: z.string().min(1),
          body: z.string().min(1),
          kind: z.enum(["info", "question", "answer", "blocker", "decision"]).optional().default("info"),
        }).shape,
      },
      async (params) => {
        try {
          const message = await this.store.sendMessage({
            from: this.teammateId,
            from_name: this.teammateName,
            to: params.to,
            to_lead: params.to_lead,
            subject: params.subject,
            body: params.body,
            kind: params.kind,
          });
          return this.ok({ message_id: message.id, sent: true });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "fetch_messages",
      {
        title: "Fetch Messages",
        description: "Fetch messages sent to you. Optionally filter by unread only.",
        inputSchema: z.object({
          unread_only: z.boolean().optional().default(true),
          thread: z.string().optional(),
        }).shape,
      },
      async (params) => {
        try {
          await this.store.load();
          const messages = this.store.fetchMessages(this.teammateId, {
            unread_only: params.unread_only,
            thread: params.thread,
          });
          return this.ok({
            count: messages.length,
            messages: messages.map((m) => ({
              id: m.id,
              from_name: m.from_name,
              kind: m.kind,
              subject: m.subject,
              body: m.body,
              created_at: m.created_at,
            })),
          });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "ack_messages",
      {
        title: "Acknowledge Messages",
        description: "Mark messages as read.",
        inputSchema: z.object({
          message_ids: z.array(z.string().min(1)),
        }).shape,
      },
      async (params) => {
        try {
          const count = await this.store.ackMessages(this.teammateId, params.message_ids);
          return this.ok({ acknowledged: count });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "write_artifact",
      {
        title: "Write Artifact",
        description: "Publish an artifact (output of your work) linked to a task.",
        inputSchema: z.object({
          task_id: z.string().min(1),
          name: z.string().min(1),
          content: z.string().min(1),
          type: z.enum(["markdown", "json", "code"]).optional().default("markdown"),
        }).shape,
      },
      async (params) => {
        try {
          const artifact = await this.store.writeArtifact({
            task_id: params.task_id,
            agent_id: this.teammateId,
            agent_name: this.teammateName,
            name: params.name,
            content: params.content,
            type: params.type,
          });
          return this.ok({ artifact_id: artifact.id, name: artifact.name });
        } catch (error) {
          return this.err(error);
        }
      }
    );

    this.server.registerTool(
      "read_artifact",
      {
        title: "Read Artifact",
        description: "Read an artifact by ID.",
        inputSchema: z.object({
          artifact_id: z.string().min(1),
        }).shape,
      },
      async (params) => {
        try {
          await this.store.load();
          const artifact = this.store.getArtifact(params.artifact_id);
          if (!artifact) return this.ok({ error: `Artifact ${params.artifact_id} not found` });
          return this.ok(artifact as unknown as Record<string, unknown>);
        } catch (error) {
          return this.err(error);
        }
      }
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Teammate MCP Server started for ${this.teammateName} (${this.teammateId})`);
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`[${this.teammateName}] Received ${signal}, shutting down...`);
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
