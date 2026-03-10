import { exec } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import type {
  AwaitCommandParams,
  AwaitUrlParams,
  AwaitFileParams,
  AwaitMcpParams,
  PollResult,
} from "./types.js";
import { findMcpConfig, getServerConfig, callMcpTool } from "./mcp-client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchOutput(
  output: string,
  match: string,
  pattern?: string
): boolean {
  const trimmed = output.trim();
  switch (match) {
    case "contains":
      return trimmed.includes(pattern ?? "");
    case "not_contains":
      return !trimmed.includes(pattern ?? "");
    case "equals":
      return trimmed === (pattern ?? "");
    case "not_equals":
      return trimmed !== (pattern ?? "");
    case "regex":
      return new RegExp(pattern ?? "").test(trimmed);
    case "exists":
      return true;
    case "not_empty":
      return trimmed.length > 0;
    default:
      return false;
  }
}

function execCommand(
  command: string,
  cwd?: string,
  shell?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd,
        shell: shell ?? "/bin/bash",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error?.code ?? (error ? 1 : 0),
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
        });
      }
    );
  });
}

export async function pollCommand(
  params: AwaitCommandParams
): Promise<PollResult> {
  const start = Date.now();
  const timeoutMs = params.timeout_seconds * 1000;
  const intervalMs = params.interval_seconds * 1000;
  let attempts = 0;
  let lastOutput = "";

  while (Date.now() - start < timeoutMs) {
    attempts++;
    const { exitCode, stdout, stderr } = await execCommand(
      params.command,
      params.cwd,
      params.shell
    );
    lastOutput = stdout || stderr;

    const exitOk = params.match === "exists" ? exitCode === 0 : true;
    if (exitOk && matchOutput(stdout, params.match, params.pattern)) {
      return {
        success: true,
        attempts,
        elapsed_seconds: Math.round((Date.now() - start) / 1000),
        last_output: lastOutput.trim(),
      };
    }

    if (Date.now() - start + intervalMs >= timeoutMs) break;
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
    last_output: lastOutput.trim(),
    error: `Timed out after ${params.timeout_seconds}s (${attempts} attempts)`,
  };
}

export async function pollUrl(params: AwaitUrlParams): Promise<PollResult> {
  const start = Date.now();
  const timeoutMs = params.timeout_seconds * 1000;
  const intervalMs = params.interval_seconds * 1000;
  let attempts = 0;
  let lastOutput = "";

  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      const response = await fetch(params.url, {
        method: params.method,
        headers: params.headers,
        signal: AbortSignal.timeout(10_000),
      });

      const body = await response.text();
      lastOutput = `HTTP ${response.status}: ${body.slice(0, 500)}`;

      const statusOk = params.expected_status
        ? response.status === params.expected_status
        : response.status >= 200 && response.status < 300;

      const bodyOk = params.body_contains
        ? body.includes(params.body_contains)
        : true;

      if (statusOk && bodyOk) {
        return {
          success: true,
          attempts,
          elapsed_seconds: Math.round((Date.now() - start) / 1000),
          last_output: lastOutput,
        };
      }
    } catch (err) {
      lastOutput = err instanceof Error ? err.message : String(err);
    }

    if (Date.now() - start + intervalMs >= timeoutMs) break;
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
    last_output: lastOutput,
    error: `Timed out after ${params.timeout_seconds}s (${attempts} attempts)`,
  };
}

export async function pollFile(params: AwaitFileParams): Promise<PollResult> {
  const start = Date.now();
  const timeoutMs = params.timeout_seconds * 1000;
  const intervalMs = params.interval_seconds * 1000;
  let attempts = 0;
  let lastOutput = "";

  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      if (params.match === "not_exists") {
        try {
          await access(params.path);
          lastOutput = "File still exists";
        } catch {
          return {
            success: true,
            attempts,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            last_output: "File does not exist",
          };
        }
      } else {
        await access(params.path);
        if (params.match === "exists") {
          return {
            success: true,
            attempts,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            last_output: "File exists",
          };
        }

        const content = await readFile(params.path, "utf-8");
        lastOutput = content.slice(0, 500);

        if (params.match === "not_empty" && content.trim().length > 0) {
          return {
            success: true,
            attempts,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            last_output: lastOutput,
          };
        }

        if (
          params.match === "contains" &&
          content.includes(params.pattern ?? "")
        ) {
          return {
            success: true,
            attempts,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            last_output: lastOutput,
          };
        }

        if (
          params.match === "regex" &&
          new RegExp(params.pattern ?? "").test(content)
        ) {
          return {
            success: true,
            attempts,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            last_output: lastOutput,
          };
        }
      }
    } catch (err) {
      lastOutput = err instanceof Error ? err.message : String(err);
      if (params.match === "exists" || params.match === "contains" || params.match === "regex" || params.match === "not_empty") {
        // noop
      }
    }

    if (Date.now() - start + intervalMs >= timeoutMs) break;
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
    last_output: lastOutput,
    error: `Timed out after ${params.timeout_seconds}s (${attempts} attempts)`,
  };
}


export async function pollMcp(params: AwaitMcpParams): Promise<PollResult> {
  const start = Date.now();
  const timeoutMs = params.timeout_seconds * 1000;
  const intervalMs = params.interval_seconds * 1000;
  let attempts = 0;
  let lastOutput = "";

  const found = await findMcpConfig(params.mcp_config_path);
  if (!found) {
    return {
      success: false,
      attempts: 0,
      elapsed_seconds: 0,
      error: "Could not find mcp.json config. Searched: .kiro/settings/mcp.json, .cursor/mcp.json, .vscode/mcp.json, and global paths. Use mcp_config_path to specify explicitly.",
    };
  }

  const serverConfig = getServerConfig(found.config, params.server_name);
  if (!serverConfig) {
    const available = Object.keys(found.config.mcpServers || {}).join(", ");
    return {
      success: false,
      attempts: 0,
      elapsed_seconds: 0,
      error: `Server '${params.server_name}' not found in ${found.path}. Available: ${available}`,
    };
  }

  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      const result = await callMcpTool(serverConfig, params.tool_name, params.tool_arguments);
      lastOutput = result.slice(0, 1000);

      if (matchOutput(result, params.match, params.pattern)) {
        return {
          success: true,
          attempts,
          elapsed_seconds: Math.round((Date.now() - start) / 1000),
          last_output: lastOutput,
        };
      }
    } catch (err) {
      lastOutput = err instanceof Error ? err.message : String(err);
    }

    if (Date.now() - start + intervalMs >= timeoutMs) break;
    await sleep(intervalMs);
  }

  return {
    success: false,
    attempts,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
    last_output: lastOutput,
    error: `Timed out after ${params.timeout_seconds}s (${attempts} attempts)`,
  };
}
