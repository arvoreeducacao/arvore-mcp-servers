import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TeamStore } from "./store.js";
import { LeadTools } from "./tools.js";
import { TeammateSpawner } from "./spawner.js";
import {
  SpawnTeamSchema,
  AddTeammateSchema,
  RemoveTeammateSchema,
  CreateTaskSchema,
  TeamStatusSchema,
  SendMessageSchema,
  WaitForTeamSchema,
  ReadArtifactSchema,
} from "./schemas.js";

export class LeadMCPServer {
  private server: McpServer;
  private store: TeamStore;
  private tools: LeadTools;
  private spawner: TeammateSpawner;

  constructor(workspacePath: string) {
    this.server = new McpServer({
      name: "agent-teams-lead",
      version: "0.1.0",
    });

    this.store = new TeamStore(workspacePath);
    this.spawner = new TeammateSpawner(workspacePath);
    this.tools = new LeadTools(this.store, this.spawner);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "spawn_team",
      {
        title: "Spawn Team",
        description:
          "Create a new agent team with an objective and a list of teammates. " +
          "Each teammate needs an agent file (e.g. refinement.md) and optionally which MCP servers they can access. " +
          "Teammates get random human names automatically.",
        inputSchema: SpawnTeamSchema.shape,
      },
      async (params) => {
        const validated = SpawnTeamSchema.parse(params);
        return this.tools.spawnTeam(validated);
      }
    );

    this.server.registerTool(
      "add_teammate",
      {
        title: "Add Teammate",
        description:
          "Add a new teammate to the active team. Provide the agent file path and optional MCP servers.",
        inputSchema: AddTeammateSchema.shape,
      },
      async (params) => {
        const validated = AddTeammateSchema.parse(params);
        return this.tools.addTeammate(validated);
      }
    );

    this.server.registerTool(
      "remove_teammate",
      {
        title: "Remove Teammate",
        description: "Remove a teammate from the active team by their ID.",
        inputSchema: RemoveTeammateSchema.shape,
      },
      async (params) => {
        const validated = RemoveTeammateSchema.parse(params);
        return this.tools.removeTeammate(validated);
      }
    );

    this.server.registerTool(
      "create_task",
      {
        title: "Create Task",
        description:
          "Create a new task for the team. Tasks can have dependencies on other tasks, " +
          "exclusive file paths (to prevent conflicts), and acceptance criteria.",
        inputSchema: CreateTaskSchema.shape,
      },
      async (params) => {
        const validated = CreateTaskSchema.parse(params);
        return this.tools.createTask(validated);
      }
    );

    this.server.registerTool(
      "team_status",
      {
        title: "Team Status",
        description:
          "Get the current status of the team: teammates, task summary, and recent messages.",
        inputSchema: TeamStatusSchema.shape,
      },
      async () => {
        return this.tools.teamStatus();
      }
    );

    this.server.registerTool(
      "send_message",
      {
        title: "Send Message",
        description:
          "Send a message to a specific teammate or broadcast to all. " +
          "Use for instructions, questions, decisions, or blockers.",
        inputSchema: SendMessageSchema.shape,
      },
      async (params) => {
        const validated = SendMessageSchema.parse(params);
        return this.tools.sendMessage(validated);
      }
    );

    this.server.registerTool(
      "wait_for_team",
      {
        title: "Wait for Team",
        description:
          "Poll and wait until all tasks are completed or blocked, or until timeout. " +
          "Returns the final state of all tasks. Default timeout is 300 seconds.",
        inputSchema: WaitForTeamSchema.shape,
      },
      async (params) => {
        const validated = WaitForTeamSchema.parse(params);
        return this.tools.waitForTeam(validated);
      }
    );

    this.server.registerTool(
      "read_artifact",
      {
        title: "Read Artifact",
        description:
          "Read an artifact published by a teammate. Artifacts are outputs of completed tasks.",
        inputSchema: ReadArtifactSchema.shape,
      },
      async (params) => {
        const validated = ReadArtifactSchema.parse(params);
        return this.tools.readArtifact(validated);
      }
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agent Teams Lead MCP Server started successfully");
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      await this.spawner.stopAll();
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
