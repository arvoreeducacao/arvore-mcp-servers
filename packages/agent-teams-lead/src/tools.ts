import { TeamStore } from "./store.js";
import { TeammateSpawner } from "./spawner.js";
import {
  type SpawnTeamParams,
  type AddTeammateParams,
  type RemoveTeammateParams,
  type CreateTaskParams,
  type SendMessageParams,
  type WaitForTeamParams,
  type ReadArtifactParams,
  type McpToolResult,
  AgentTeamsError,
} from "./schemas.js";

export class LeadTools {
  constructor(
    private store: TeamStore,
    private spawner: TeammateSpawner
  ) {}

  async spawnTeam(params: SpawnTeamParams): Promise<McpToolResult> {
    try {
      const team = await this.store.spawnTeam(
        params.objective,
        params.teammates
      );

      for (const teammate of team.teammates) {
        await this.spawner.spawnTeammate(teammate, team.objective);
      }

      return this.ok({
        team_id: team.id,
        objective: team.objective,
        teammates: team.teammates.map((t) => ({
          id: t.id,
          name: t.name,
          role: t.role,
          agent: t.agent,
        })),
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async addTeammate(params: AddTeammateParams): Promise<McpToolResult> {
    try {
      const teammate = await this.store.addTeammate(
        params.agent,
        params.mcp_servers
      );

      const team = this.store.getTeam();
      if (team) {
        await this.spawner.spawnTeammate(teammate, team.objective);
      }

      return this.ok({
        id: teammate.id,
        name: teammate.name,
        role: teammate.role,
        agent: teammate.agent,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async removeTeammate(params: RemoveTeammateParams): Promise<McpToolResult> {
    try {
      await this.spawner.stopTeammate(params.teammate_id);
      await this.store.removeTeammate(params.teammate_id);
      return this.ok({ removed: true, teammate_id: params.teammate_id });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async createTask(params: CreateTaskParams): Promise<McpToolResult> {
    try {
      const task = await this.store.createTask({
        title: params.title,
        description: params.description,
        depends_on: params.depends_on,
        exclusive_paths: params.exclusive_paths,
        acceptance_criteria: params.acceptance_criteria,
      });

      return this.ok({
        task_id: task.id,
        title: task.title,
        status: task.status,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async teamStatus(): Promise<McpToolResult> {
    try {
      await this.store.load();
      const team = this.store.getTeam();
      if (!team) {
        return this.ok({ active: false, message: "No active team" });
      }

      const tasks = this.store.getTasks();
      const messages = this.store.getMessages({ to: "lead" });
      const unreadMessages = this.store.getMessages({
        to: "lead",
        unread_by: "lead",
      });

      const taskSummary = {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
      };

      return this.ok({
        active: true,
        team_id: team.id,
        objective: team.objective,
        teammates: team.teammates
          .filter((t) => t.status !== "removed")
          .map((t) => ({
            id: t.id,
            name: t.name,
            role: t.role,
            status: t.status,
            running: this.spawner.isRunning(t.id),
          })),
        task_summary: taskSummary,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assigned_to: t.assigned_to,
        })),
        unread_messages: unreadMessages.length,
        recent_messages: messages.slice(-10).map((m) => ({
          id: m.id,
          from_name: m.from_name,
          kind: m.kind,
          subject: m.subject,
          created_at: m.created_at,
        })),
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async sendMessage(params: SendMessageParams): Promise<McpToolResult> {
    try {
      const message = await this.store.sendMessage({
        from: "lead",
        from_name: "Lead",
        to: params.to,
        broadcast: params.broadcast,
        subject: params.subject,
        body: params.body,
        kind: params.kind,
      });

      const deliveredTo = params.broadcast
        ? this.store
            .getTeam()
            ?.teammates.filter((t) => t.status === "active")
            .map((t) => t.name) || []
        : [params.to];

      return this.ok({
        message_id: message.id,
        delivered_to: deliveredTo,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async waitForTeam(params: WaitForTeamParams): Promise<McpToolResult> {
    try {
      const team = this.store.getTeam();
      if (!team) {
        return this.ok({ error: "No active team" });
      }

      const timeoutMs = params.timeout_seconds * 1000;
      const pollInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeoutMs) {
        await this.store.load();
        const tasks = this.store.getTasks();

        const pending = tasks.filter((t) => t.status === "pending");
        const inProgress = tasks.filter((t) => t.status === "in_progress");
        const completed = tasks.filter((t) => t.status === "completed");
        const blocked = tasks.filter((t) => t.status === "blocked");

        const allTeammatesDone = team.teammates
          .filter((t) => t.status === "active")
          .every((t) => !this.spawner.isRunning(t.id));

        if (
          (inProgress.length === 0 && pending.length === 0) ||
          allTeammatesDone
        ) {
          return this.ok({
            done: true,
            reason:
              inProgress.length === 0 && pending.length === 0
                ? "all_tasks_resolved"
                : "all_teammates_finished",
            elapsed_seconds: Math.round((Date.now() - startTime) / 1000),
            completed: completed.map((t) => ({
              id: t.id,
              title: t.title,
              summary: t.summary,
            })),
            blocked: blocked.map((t) => ({
              id: t.id,
              title: t.title,
              notes: t.notes,
            })),
          });
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      const tasks = this.store.getTasks();
      return this.ok({
        done: false,
        timed_out: true,
        elapsed_seconds: params.timeout_seconds,
        pending: tasks
          .filter((t) => t.status === "pending")
          .map((t) => ({ id: t.id, title: t.title })),
        in_progress: tasks
          .filter((t) => t.status === "in_progress")
          .map((t) => ({
            id: t.id,
            title: t.title,
            assigned_to: t.assigned_to,
          })),
        completed: tasks
          .filter((t) => t.status === "completed")
          .map((t) => ({ id: t.id, title: t.title })),
        blocked: tasks
          .filter((t) => t.status === "blocked")
          .map((t) => ({ id: t.id, title: t.title })),
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async readArtifact(params: ReadArtifactParams): Promise<McpToolResult> {
    try {
      await this.store.load();
      const artifact = this.store.getArtifact(params.artifact_id);
      if (!artifact) {
        return this.ok({
          error: `Artifact ${params.artifact_id} not found`,
        });
      }

      return this.ok({
        id: artifact.id,
        task_id: artifact.task_id,
        agent_name: artifact.agent_name,
        name: artifact.name,
        type: artifact.type,
        content: artifact.content,
        created_at: artifact.created_at,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private ok(data: Record<string, unknown>): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private errorResult(error: unknown): McpToolResult {
    const message =
      error instanceof AgentTeamsError
        ? `AgentTeams Error [${error.code}]: ${error.message}`
        : `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`;

    return {
      content: [
        { type: "text", text: JSON.stringify({ error: message }, null, 2) },
      ],
    };
  }
}
