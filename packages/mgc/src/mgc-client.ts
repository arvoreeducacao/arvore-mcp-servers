import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MgcExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class MgcClient {
  private mgcPath: string;

  constructor(mgcPath?: string) {
    this.mgcPath = mgcPath || process.env.MGC_CLI_PATH || "mgc";
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
        },
      });

      return { stdout, stderr, exitCode: 0 };
    } catch (error: unknown) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        killed?: boolean;
      };

      if (execError.killed) {
        return {
          stdout: execError.stdout || "",
          stderr: `Command timed out after ${timeout}ms`,
          exitCode: 124,
        };
      }

      return {
        stdout: execError.stdout || "",
        stderr: execError.stderr || String(error),
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

    // Always add --no-confirm to avoid interactive prompts
    if (!args.includes("--no-confirm")) {
      args.push("--no-confirm");
    }

    return this.execute(args);
  }
}
