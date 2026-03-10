import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpConfigFile, McpServerConfig } from "./types.js";

const CONFIG_SEARCH_PATHS = [
  ".kiro/settings/mcp.json",
  ".cursor/mcp.json",
  ".vscode/mcp.json",
];

const GLOBAL_CONFIG_PATHS = [
  join(homedir(), ".kiro", "settings", "mcp.json"),
  join(homedir(), ".cursor", "mcp.json"),
  join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
];

function expandEnvVars(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/\$\{(\w+)\}/g, (_, key) => env[key] ?? "");
}

function resolveEnv(serverEnv?: Record<string, string>): Record<string, string> {
  if (!serverEnv) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(serverEnv)) {
    resolved[key] = expandEnvVars(value, process.env as Record<string, string>);
  }
  return resolved;
}

async function tryReadJson(path: string): Promise<McpConfigFile | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as McpConfigFile;
  } catch {
    return null;
  }
}

export async function findMcpConfig(explicitPath?: string): Promise<{ config: McpConfigFile; path: string } | null> {
  if (explicitPath) {
    const config = await tryReadJson(explicitPath);
    if (config) return { config, path: explicitPath };
    return null;
  }

  for (const relative of CONFIG_SEARCH_PATHS) {
    const fullPath = join(process.cwd(), relative);
    if (existsSync(fullPath)) {
      const config = await tryReadJson(fullPath);
      if (config) return { config, path: fullPath };
    }
  }

  for (const fullPath of GLOBAL_CONFIG_PATHS) {
    if (existsSync(fullPath)) {
      const config = await tryReadJson(fullPath);
      if (config) return { config, path: fullPath };
    }
  }

  return null;
}

export function getServerConfig(config: McpConfigFile, serverName: string): McpServerConfig | null {
  const direct = config.mcpServers?.[serverName];
  if (direct) return direct;

  const proxyConfig = config.mcpServers?.["mcp-proxy"];
  if (!proxyConfig?.env) return null;

  const upstreamsRaw = proxyConfig.env["MCP_PROXY_UPSTREAMS"];
  if (!upstreamsRaw) return null;

  try {
    const expanded = expandEnvVars(upstreamsRaw, { ...process.env, ...proxyConfig.env } as Record<string, string>);
    const upstreams = JSON.parse(expanded) as Array<{
      name: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }>;

    const upstream = upstreams.find((u) => u.name === serverName);
    if (!upstream) return null;

    const resolvedUpstreamEnv: Record<string, string> = {};
    if (upstream.env) {
      const mergedParentEnv = { ...process.env, ...proxyConfig.env } as Record<string, string>;
      for (const [key, value] of Object.entries(upstream.env)) {
        resolvedUpstreamEnv[key] = expandEnvVars(value, mergedParentEnv);
      }
    }

    return {
      command: upstream.command,
      args: upstream.args,
      env: resolvedUpstreamEnv,
    };
  } catch {
    return null;
  }
}

export async function callMcpTool(
  serverConfig: McpServerConfig,
  toolName: string,
  toolArguments: Record<string, unknown>
): Promise<string> {
  if (!serverConfig.command) {
    throw new Error("Only stdio-based MCP servers are supported (need 'command' in config)");
  }

  const client = new Client({ name: "await-until-mcp-client", version: "1.0.0" });
  const resolvedEnv = resolveEnv(serverConfig.env);

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    env: { ...process.env, ...resolvedEnv } as Record<string, string>,
  });

  try {
    await client.connect(transport);

    const result = await client.callTool({
      name: toolName,
      arguments: toolArguments,
    });

    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text?: string }) => c.text ?? "");
      return textParts.join("\n");
    }

    return JSON.stringify(result);
  } finally {
    try {
      await client.close();
    } catch {
      // noop
    }
  }
}
