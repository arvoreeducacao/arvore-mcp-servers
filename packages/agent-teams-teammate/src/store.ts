import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withFileLock } from "./filelock.js";

interface Team {
  id: string;
  objective: string;
  created_at: string;
  teammates: Array<{
    id: string;
    name: string;
    role: string;
    agent: string;
    status: string;
  }>;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_to?: string;
  depends_on: string[];
  exclusive_paths: string[];
  acceptance_criteria: string[];
  artifacts: string[];
  touched_paths: string[];
  notes: string[];
  created_at: string;
  completed_at?: string;
  summary?: string;
}

interface Message {
  id: string;
  from: string;
  from_name: string;
  to: string;
  thread?: string;
  kind: string;
  subject: string;
  body: string;
  read_by: string[];
  created_at: string;
}

interface Artifact {
  id: string;
  task_id: string;
  agent_id: string;
  agent_name: string;
  name: string;
  content: string;
  type: string;
  created_at: string;
}

export class TeammateStore {
  private basePath: string;
  private team: Team | null = null;
  private tasks: Task[] = [];
  private messages: Message[] = [];
  private artifacts: Artifact[] = [];

  constructor(workspacePath: string) {
    this.basePath = join(workspacePath, ".agent-teams");
  }

  private generateId(): string {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

  getTeam(): Team | null {
    return this.team;
  }

  getTeammate(teammateId: string) {
    return this.team?.teammates.find((t) => t.id === teammateId) || null;
  }

  listTasks(filter?: { status?: string }): Task[] {
    let result = [...this.tasks];
    if (filter?.status) {
      result = result.filter((t) => t.status === filter.status);
    }
    return result;
  }

  async claimTask(taskId: string, agentId: string): Promise<Task> {
    return withFileLock(this.tasksPath(), async () => {
      this.tasks = await this.readJson<Task[]>(this.tasksPath(), []);

      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      if (task.status !== "pending") throw new Error(`Task ${taskId} is not pending (status: ${task.status})`);
      if (task.assigned_to) throw new Error(`Task ${taskId} already assigned to ${task.assigned_to}`);

      const unblockedDeps = task.depends_on.every((depId) => {
        const dep = this.tasks.find((t) => t.id === depId);
        return dep && dep.status === "completed";
      });
      if (!unblockedDeps) throw new Error(`Task ${taskId} has unresolved dependencies`);

      task.status = "in_progress";
      task.assigned_to = agentId;
      await this.writeJson(this.tasksPath(), this.tasks);
      return task;
    });
  }

  async updateTask(
    taskId: string,
    agentId: string,
    updates: { status?: string; note?: string }
  ): Promise<Task> {
    return withFileLock(this.tasksPath(), async () => {
      this.tasks = await this.readJson<Task[]>(this.tasksPath(), []);

      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      if (task.assigned_to !== agentId) throw new Error(`Task ${taskId} not assigned to you`);

      if (updates.status) task.status = updates.status;
      if (updates.note) task.notes.push(updates.note);
      await this.writeJson(this.tasksPath(), this.tasks);
      return task;
    });
  }

  async completeTask(
    taskId: string,
    agentId: string,
    params: {
      summary: string;
      artifacts?: string[];
      touched_paths?: string[];
    }
  ): Promise<Task> {
    return withFileLock(this.tasksPath(), async () => {
      this.tasks = await this.readJson<Task[]>(this.tasksPath(), []);

      const task = this.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      if (task.assigned_to !== agentId) throw new Error(`Task ${taskId} not assigned to you`);

      task.status = "completed";
      task.completed_at = new Date().toISOString();
      task.summary = params.summary;
      if (params.artifacts) task.artifacts.push(...params.artifacts);
      if (params.touched_paths) task.touched_paths.push(...params.touched_paths);
      await this.writeJson(this.tasksPath(), this.tasks);
      return task;
    });
  }

  async sendMessage(params: {
    from: string;
    from_name: string;
    to?: string;
    to_lead?: boolean;
    subject: string;
    body: string;
    kind: string;
    thread?: string;
  }): Promise<Message> {
    return withFileLock(this.messagesPath(), async () => {
      this.messages = await this.readJson<Message[]>(this.messagesPath(), []);

      const message: Message = {
        id: this.generateId(),
        from: params.from,
        from_name: params.from_name,
        to: params.to_lead ? "lead" : params.to || "broadcast",
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

  fetchMessages(
    agentId: string,
    filter?: { unread_only?: boolean; thread?: string }
  ): Message[] {
    let result = this.messages.filter(
      (m) => m.to === agentId || m.to === "broadcast"
    );
    if (filter?.unread_only) {
      result = result.filter((m) => !m.read_by.includes(agentId));
    }
    if (filter?.thread) {
      result = result.filter((m) => m.thread === filter.thread);
    }
    return result;
  }

  async ackMessages(agentId: string, messageIds: string[]): Promise<number> {
    return withFileLock(this.messagesPath(), async () => {
      this.messages = await this.readJson<Message[]>(this.messagesPath(), []);

      let count = 0;
      for (const msg of this.messages) {
        if (messageIds.includes(msg.id) && !msg.read_by.includes(agentId)) {
          msg.read_by.push(agentId);
          count++;
        }
      }
      await this.writeJson(this.messagesPath(), this.messages);
      return count;
    });
  }

  async writeArtifact(params: {
    task_id: string;
    agent_id: string;
    agent_name: string;
    name: string;
    content: string;
    type: string;
  }): Promise<Artifact> {
    return withFileLock(this.artifactsPath(), async () => {
      this.artifacts = await this.readJson<Artifact[]>(this.artifactsPath(), []);

      const artifact: Artifact = {
        id: this.generateId(),
        task_id: params.task_id,
        agent_id: params.agent_id,
        agent_name: params.agent_name,
        name: params.name,
        content: params.content,
        type: params.type,
        created_at: new Date().toISOString(),
      };
      this.artifacts.push(artifact);
      await this.writeJson(this.artifactsPath(), this.artifacts);
      return artifact;
    });
  }

  getArtifact(artifactId: string): Artifact | undefined {
    return this.artifacts.find((a) => a.id === artifactId);
  }
}
