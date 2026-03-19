import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

export interface MgcExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface MgcClientOptions {
  mgcPath?: string;
  region?: string;
}

export class MgcClient {
  private mgcPath: string;
  private region: string | undefined;

  constructor(options?: MgcClientOptions) {
    this.mgcPath = options?.mgcPath || process.env.MGC_CLI_PATH || "mgc";
    this.region = options?.region || process.env.MGC_REGION || undefined;
  }

  async execute(
    args: string[],
    options?: { timeout?: number }
  ): Promise<MgcExecResult> {
    const timeout = options?.timeout || 60000;

    try {
      const { stdout, stderr } = await execFileAsync(this.mgcPath, args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          NO_COLOR: "1",
          TERM: "dumb",
        },
      });

      return { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
      };

      if (execError.killed) {
        return {
          stdout: stripAnsi(execError.stdout || ""),
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: 124,
        };
      }

      return {
        stdout: stripAnsi(execError.stdout || ""),
        stderr: stripAnsi(execError.stderr || String(error)),
        exitCode: typeof execError.code === "number" ? execError.code : 1,
      };
    }
  }

  async executeCommand(
    command: string,
    outputFormat?: string
  ): Promise<MgcExecResult> {
    const args = command.split(/\s+/).filter(Boolean);

    if (outputFormat && !args.includes("-o") && !args.includes("--output")) {
      args.push("-o", outputFormat);
    }

    if (!args.includes("--no-confirm")) {
      args.push("--no-confirm");
    }

    if (this.region && !args.includes("--region")) {
      args.push("--region", this.region);
    }

    return this.execute(args);
  }
}
