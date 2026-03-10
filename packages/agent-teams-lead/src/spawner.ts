import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, readFile, unlink, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Teammate } from "./types.js";

interface SpawnedProcess {
  teammateId: string;
  process: ChildProcess;
  agentConfigPath: string;
}

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  autoApprove?: string[];
  disabled?: boolean;
}

interface McpJson {
  mcpServers: Record<string, McpServerConfig>;
}

export class TeammateSpawner {
  private processes: Map<string, SpawnedProcess> = new Map();
  private workspacePath: string;
  private agentsDir: string;
  private teammateMcpPath: string;
  private mcpConfigCache: McpJson | null = null;
  private logPath: string;

  constructor(workspacePath: string) {
    this.workspacePath = resolve(workspacePath);
    this.agentsDir = join(this.workspacePath, ".kiro", "agents");
    this.logPath = join(this.workspacePath, ".agent-teams", "team.log");
    this.teammateMcpPath = join(
      this.workspacePath,
      "arvore-mcp-servers",
      "packages",
      "agent-teams-teammate",
      "dist",
      "index.js"
    );
  }

  private async log(source: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${source}] ${message}\n`;
    console.error(line.trim());
    try {
      const dir = join(this.workspacePath, ".agent-teams");
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      await appendFile(this.logPath, line);
    } catch {
      // noop
    }
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-");
  }

  async spawnTeammate(
    teammate: Teammate,
    teamObjective: string
  ): Promise<void> {
    await this.ensureAgentsDir();

    const agentPrompt = await this.buildPrompt(teammate, teamObjective);
    const agentConfig = await this.buildAgentConfig(teammate, agentPrompt);
    const configFileName = `teammate-${this.sanitizeName(teammate.name)}`;
    const configPath = join(this.agentsDir, `${configFileName}.json`);

    await writeFile(configPath, JSON.stringify(agentConfig, null, 2));
    await this.log(teammate.name, `Agent config written to: ${configPath}`);

    const proc = spawn(
      "kiro-cli",
      [
        "chat",
        "--no-interactive",
        "--trust-all-tools",
        "--agent",
        configFileName,
        agentPrompt,
      ],
      {
        cwd: this.workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
        env: {
          ...process.env,
          TEAMMATE_ID: teammate.id,
          TEAMMATE_NAME: teammate.name,
          WORKSPACE_PATH: this.workspacePath,
        },
      }
    );

    await this.log(teammate.name, `Process spawned with PID: ${proc.pid}`);

    proc.stdout?.on("data", (data: Buffer) => {
      this.log(teammate.name, `stdout: ${data.toString().trim()}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      this.log(teammate.name, `stderr: ${data.toString().trim()}`);
    });

    proc.on("exit", (code) => {
      this.log(teammate.name, `Exited with code ${code}`);
      this.processes.delete(teammate.id);
      this.cleanupAgentConfig(configPath);
    });

    proc.on("error", (err) => {
      this.log(teammate.name, `Spawn error: ${err.message}`);
      this.processes.delete(teammate.id);
      this.cleanupAgentConfig(configPath);
    });

    this.processes.set(teammate.id, {
      teammateId: teammate.id,
      process: proc,
      agentConfigPath: configPath,
    });
  }

  async stopTeammate(teammateId: string): Promise<void> {
    const spawned = this.processes.get(teammateId);
    if (!spawned) return;

    await this.log(teammateId, "Stopping teammate process");
    spawned.process.kill("SIGTERM");
    this.processes.delete(teammateId);
    await this.cleanupAgentConfig(spawned.agentConfigPath);
  }

  async stopAll(): Promise<void> {
    await this.log("lead", "Stopping all teammate processes");
    for (const [id] of this.processes) {
      await this.stopTeammate(id);
    }
  }

  isRunning(teammateId: string): boolean {
    const spawned = this.processes.get(teammateId);
    return !!spawned && !spawned.process.killed;
  }

  private async loadMcpConfig(): Promise<McpJson> {
    if (this.mcpConfigCache) return this.mcpConfigCache;

    const mcpJsonPath = join(
      this.workspacePath,
      ".kiro",
      "settings",
      "mcp.json"
    );

    if (!existsSync(mcpJsonPath)) {
      this.mcpConfigCache = { mcpServers: {} };
      return this.mcpConfigCache;
    }

    const raw = await readFile(mcpJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as McpJson;

    const flatServers: Record<string, McpServerConfig> = {};

    for (const [name, config] of Object.entries(parsed.mcpServers)) {
      if (name === "mcp-proxy" && config.env?.MCP_PROXY_UPSTREAMS) {
        try {
          const upstreams = JSON.parse(
            config.env.MCP_PROXY_UPSTREAMS
          ) as Array<{
            name: string;
            command: string;
            args?: string[];
            env?: Record<string, string>;
          }>;

          const proxyEnv = config.env || {};

          for (const upstream of upstreams) {
            const resolvedEnv: Record<string, string> = {};
            if (upstream.env) {
              for (const [envKey, envVal] of Object.entries(upstream.env)) {
                const varMatch = envVal.match(/^\$\{(.+)\}$/);
                if (varMatch && proxyEnv[varMatch[1]]) {
                  resolvedEnv[envKey] = proxyEnv[varMatch[1]];
                } else {
                  resolvedEnv[envKey] = envVal;
                }
              }
            }

            flatServers[upstream.name] = {
              command: upstream.command,
              args: upstream.args,
              env: resolvedEnv,
            };
          }
        } catch {
          flatServers[name] = config;
        }
      } else {
        flatServers[name] = config;
      }
    }

    this.mcpConfigCache = { mcpServers: flatServers };
    return this.mcpConfigCache;
  }

  private async resolveMcpServers(
    requestedServers?: string[]
  ): Promise<Record<string, McpServerConfig>> {
    if (!requestedServers || requestedServers.length === 0) return {};

    const mcpConfig = await this.loadMcpConfig();
    const resolved: Record<string, McpServerConfig> = {};

    for (const serverName of requestedServers) {
      const config = mcpConfig.mcpServers[serverName];
      if (config && !config.disabled) {
        resolved[serverName] = { ...config };
      }
    }

    return resolved;
  }

  private async buildPrompt(
    teammate: Teammate,
    teamObjective: string
  ): Promise<string> {
    let agentInstructions = "";

    const workspaceAgentsDir = join(this.workspacePath, ".kiro", "agents");
    const mdPath = join(workspaceAgentsDir, teammate.agent);
    if (existsSync(mdPath)) {
      const raw = await readFile(mdPath, "utf-8");
      const bodyMatch = raw.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
      agentInstructions = bodyMatch ? bodyMatch[1].trim() : raw;
    }

    return [
      `You are ${teammate.name}, a teammate in an agent team.`,
      `Your role: ${teammate.role}`,
      `Team objective: ${teamObjective}`,
      "",
      "## CRITICAL WORKFLOW",
      "",
      "You MUST use the agent-teams-teammate MCP tools (NOT mcp-proxy). Follow this loop:",
      "",
      "1. Call whoami to confirm your identity",
      "2. Call list_tasks to see available tasks",
      "3. If there are NO pending tasks, call fetch_messages to check for instructions, then call list_tasks again (tasks may still be getting created). Retry up to 5 times with a few seconds between each attempt before giving up.",
      "4. Call claim_task on a pending task to start working on it",
      "5. Do the actual work (create files, write code, etc.)",
      "6. Call complete_task with a summary of what you did and which files you touched",
      "7. Call list_tasks again to check for more pending tasks",
      "8. If there are more pending tasks, go back to step 4",
      "9. Call send_message to notify the lead or other teammates about your progress",
      "",
      "IMPORTANT:",
      "- Tasks may not exist immediately when you start. ALWAYS retry list_tasks if it returns empty.",
      "- Use ONLY the agent-teams-teammate MCP server for task management. Do NOT search for tools via mcp-proxy.",
      "- After completing all your tasks, check one more time for new tasks before finishing.",
      "",
      agentInstructions ? `## Agent Instructions\n\n${agentInstructions}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async buildAgentConfig(
    teammate: Teammate,
    prompt: string
  ): Promise<Record<string, unknown>> {
    const extraMcpServers = await this.resolveMcpServers(teammate.mcp_servers);

    const mcpServers: Record<string, unknown> = {
      "agent-teams-teammate": {
        command: "node",
        args: [this.teammateMcpPath],
        env: {
          TEAMMATE_ID: teammate.id,
          TEAMMATE_NAME: teammate.name,
          WORKSPACE_PATH: this.workspacePath,
        },
      },
      ...extraMcpServers,
    };

    const toolAliases: string[] = [
      "read",
      "write",
      "shell",
      "grep",
      "glob",
      "@agent-teams-teammate",
    ];

    for (const serverName of Object.keys(extraMcpServers)) {
      toolAliases.push(`@${serverName}`);
    }

    return {
      name: `teammate-${this.sanitizeName(teammate.name)}`,
      description: `${teammate.name} — ${teammate.role} teammate`,
      prompt,
      tools: toolAliases,
      allowedTools: ["*"],
      mcpServers,
      includeMcpJson: false,
    };
  }

  private async ensureAgentsDir(): Promise<void> {
    if (!existsSync(this.agentsDir)) {
      await mkdir(this.agentsDir, { recursive: true });
    }
  }

  private async cleanupAgentConfig(configPath: string): Promise<void> {
    try {
      if (existsSync(configPath)) {
        await unlink(configPath);
      }
    } catch {
      // noop
    }
  }
}
