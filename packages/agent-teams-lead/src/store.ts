import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Team,
  type Teammate,
  type Task,
  type Message,
  type Artifact,
  type TaskStatus,
} from "./types.js";
import { AgentTeamsError } from "./schemas.js";
import { generateTeammateName, resetNames } from "./names.js";
import { withFileLock } from "./filelock.js";

export class TeamStore {
  private basePath: string;
  private team: Team | null = null;
  private tasks: Task[] = [];
  private messages: Message[] = [];
  private artifacts: Artifact[] = [];

  constructor(basePath: string) {
    this.basePath = join(basePath, ".agent-teams");
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.basePath)) {
      await mkdir(this.basePath, { recursive: true });
    }
    const artifactsDir = join(this.basePath, "artifacts");
    if (!existsSync(artifactsDir)) {
      await mkdir(artifactsDir, { recursive: true });
    }
  }

  private teamPath(): string {
    return join(this.basePath, "team.json");
  }

  private tasksPath(): string {
    return join(this.basePath, "tasks.json");
  }

  private messagesPath(): string {
    return join(this.basePath, "messages.json");
  }

  private artifactsPath(): string {
    return join(this.basePath, "artifacts.json");
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    if (!existsSync(filePath)) return fallback;
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async load(): Promise<void> {
    await this.ensureDir();
    this.team = await this.readJson<Team | null>(this.teamPath(), null);
    this.tasks = await this.readJson<Task[]>(this.tasksPath(), []);
    this.messages = await this.readJson<Message[]>(this.messagesPath(), []);
    this.artifacts = await this.readJson<Artifact[]>(this.artifactsPath(), []);
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getTeam(): Team | null {
    return this.team;
  }

  async spawnTeam(
    objective: string,
    teammateConfigs: Array<{ agent: string; mcp_servers?: string[] }>
  ): Promise<Team> {
    resetNames();

    const teammates: Teammate[] = teammateConfigs.map((config) => {
      const name = generateTeammateName();
      const role = config.agent.replace(/\.(md|json)$/, "");
      return {
        id: this.generateId(),
        name,
        role,
        agent: config.agent,
        mcp_servers: config.mcp_servers,
        status: "active",
        registered_at: new Date().toISOString(),
      };
    });

    this.team = {
      id: this.generateId(),
      objective,
      created_at: new Date().toISOString(),
      teammates,
    };

    this.tasks = [];
    this.messages = [];
    this.artifacts = [];

    await this.ensureDir();
    await this.writeJson(this.teamPath(), this.team);
    await this.writeJson(this.tasksPath(), this.tasks);
    await this.writeJson(this.messagesPath(), this.messages);
    await this.writeJson(this.artifactsPath(), this.artifacts);

    return this.team;
  }

  async addTeammate(
    agent: string,
    mcpServers?: string[]
  ): Promise<Teammate> {
    return withFileLock(this.teamPath(), async () => {
      this.team = await this.readJson<Team | null>(this.teamPath(), null);
      if (!this.team) {
        throw new AgentTeamsError("No active team", "NO_TEAM");
      }

      const name = generateTeammateName();
      const role = agent.replace(/\.(md|json)$/, "");
      const teammate: Teammate = {
        id: this.generateId(),
        name,
        role,
        agent,
        mcp_servers: mcpServers,
        status: "active",
        registered_at: new Date().toISOString(),
      };

      this.team.teammates.push(teammate);
      await this.writeJson(this.teamPath(), this.team);
      return teammate;
    });
  }

  async removeTeammate(teammateId: string): Promise<void> {
    return withFileLock(this.teamPath(), async () => {
      this.team = await this.readJson<Team | null>(this.teamPath(), null);
      if (!this.team) {
        throw new AgentTeamsError("No active team", "NO_TEAM");
      }

      const teammate = this.team.teammates.find((t) => t.id === teammateId);
      if (!teammate) {
        throw new AgentTeamsError(
          `Teammate ${teammateId} not found`,
          "NOT_FOUND"
        );
      }

      teammate.status = "removed";
      await this.writeJson(this.teamPath(), this.team);
    });
  }

  async createTask(params: {
    title: string;
    description: string;
    depends_on: string[];
    exclusive_paths: string[];
    acceptance_criteria: string[];
  }): Promise<Task> {
    return withFileLock(this.tasksPath(), async () => {
      this.tasks = await this.readJson<Task[]>(this.tasksPath(), []);

      if (!this.team) {
        this.team = await this.readJson<Team | null>(this.teamPath(), null);
      }
      if (!this.team) {
        throw new AgentTeamsError("No active team", "NO_TEAM");
      }

      const task: Task = {
        id: this.generateId(),
        title: params.title,
        description: params.description,
        status: "pending",
        depends_on: params.depends_on,
        exclusive_paths: params.exclusive_paths,
        acceptance_criteria: params.acceptance_criteria,
        artifacts: [],
        touched_paths: [],
        notes: [],
        created_at: new Date().toISOString(),
      };

      this.tasks.push(task);
      await this.writeJson(this.tasksPath(), this.tasks);
      return task;
    });
  }

  getTasks(filter?: { status?: TaskStatus; assigned_to?: string }): Task[] {
    let result = [...this.tasks];
    if (filter?.status) {
      result = result.filter((t) => t.status === filter.status);
    }
    if (filter?.assigned_to) {
      result = result.filter((t) => t.assigned_to === filter.assigned_to);
    }
    return result;
  }

  async sendMessage(params: {
    from: string;
    from_name: string;
    to?: string;
    broadcast?: boolean;
    subject: string;
    body: string;
    kind: Message["kind"];
    thread?: string;
  }): Promise<Message> {
    return withFileLock(this.messagesPath(), async () => {
      this.messages = await this.readJson<Message[]>(this.messagesPath(), []);

      if (!this.team) {
        this.team = await this.readJson<Team | null>(this.teamPath(), null);
      }
      if (!this.team) {
        throw new AgentTeamsError("No active team", "NO_TEAM");
      }

      const message: Message = {
        id: this.generateId(),
        from: params.from,
        from_name: params.from_name,
        to: params.broadcast ? "broadcast" : params.to || "broadcast",
        thread: params.thread,
        kind: params.kind,
        subject: params.subject,
        body: params.body,
        read_by: [params.from],
        created_at: new Date().toISOString(),
      };

      this.messages.push(message);
      await this.writeJson(this.messagesPath(), this.messages);
      return message;
    });
  }

  getMessages(filter?: {
    to?: string;
    thread?: string;
    unread_by?: string;
  }): Message[] {
    let result = [...this.messages];
    if (filter?.to) {
      result = result.filter(
        (m) => m.to === filter.to || m.to === "broadcast"
      );
    }
    if (filter?.thread) {
      result = result.filter((m) => m.thread === filter.thread);
    }
    if (filter?.unread_by) {
      result = result.filter((m) => !m.read_by.includes(filter.unread_by!));
    }
    return result;
  }

  getArtifact(artifactId: string): Artifact | undefined {
    return this.artifacts.find((a) => a.id === artifactId);
  }

  getArtifacts(): Artifact[] {
    return [...this.artifacts];
  }
}
