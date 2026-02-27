import { exec } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ProcessInfo, Framework, RuntimeLensError } from "./types.js";

const execAsync = promisify(exec);

interface RunningProcess {
  pid: number;
  command: string;
  port?: number;
  framework?: Framework;
}

export class ProcessInspector {
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  getProcessInfo(): ProcessInfo {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      cpuUsage: {
        user: cpu.user,
        system: cpu.system,
      },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
    };
  }

  async findRunningProcesses(): Promise<RunningProcess[]> {
    const processes: RunningProcess[] = [];

    try {
      const { stdout } = await execAsync(
        "ps aux | grep -E '(node|next|nest|react-scripts)' | grep -v grep"
      );

      for (const line of stdout.split("\n").filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1], 10);
        const command = parts.slice(10).join(" ");

        if (isNaN(pid)) continue;

        const framework = this.detectFrameworkFromCommand(command);
        const port = await this.findPortForPid(pid);

        processes.push({ pid, command, port: port || undefined, framework });
      }
    } catch {
      // ps command failed
    }

    return processes;
  }

  async getPortListeners(): Promise<{ port: number; pid: number; process: string }[]> {
    const listeners: { port: number; pid: number; process: string }[] = [];

    try {
      const { stdout } = await execAsync(
        "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep node || true"
      );

      for (const line of stdout.split("\n").filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const processName = parts[0];
        const pid = parseInt(parts[1], 10);
        const portRegex = /:(\d+)$/;
        const portMatch = parts[8] ? portRegex.exec(parts[8]) : null;

        if (!isNaN(pid) && portMatch) {
          listeners.push({
            port: parseInt(portMatch[1], 10),
            pid,
            process: processName,
          });
        }
      }
    } catch {
      // lsof failed
    }

    return listeners;
  }

  async getEnvironmentInfo(): Promise<{
    process: ProcessInfo;
    runningProcesses: RunningProcess[];
    ports: { port: number; pid: number; process: string }[];
    projectStructure: {
      framework: Framework;
      logFiles: string[];
      configFiles: string[];
    };
  }> {
    const [runningProcesses, ports, projectStructure] = await Promise.all([
      this.findRunningProcesses(),
      this.getPortListeners(),
      this.scanProject(),
    ]);

    return {
      process: this.getProcessInfo(),
      runningProcesses,
      ports,
      projectStructure,
    };
  }

  async executeExpression(expression: string): Promise<{ result: string; type: string }> {
    try {
      const fn = new Function("require", `return (${expression})`);
      const result = fn(require);
      const type = typeof result;
      return {
        result: typeof result === "object" ? JSON.stringify(result, null, 2) : String(result),
        type,
      };
    } catch (error) {
      throw new RuntimeLensError(
        `Expression evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        "EVAL_FAILED"
      );
    }
  }

  private async scanProject(): Promise<{
    framework: Framework;
    logFiles: string[];
    configFiles: string[];
  }> {
    const framework = await this.detectProjectFramework();
    const configFiles = await this.findConfigFiles();
    const logFiles = await this.findLogFiles();

    return { framework, logFiles, configFiles };
  }

  private async detectProjectFramework(): Promise<Framework> {
    try {
      const content = await readFile(join(this.projectRoot, "package.json"), "utf-8");
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps["@nestjs/core"]) return "nestjs";
      if (deps["next"]) return "nextjs";
      if (deps["react"]) return "react";
    } catch {
      // no package.json
    }
    return "unknown";
  }

  private async findConfigFiles(): Promise<string[]> {
    const candidates = [
      "package.json", "tsconfig.json", "next.config.js", "next.config.mjs",
      "next.config.ts", "nest-cli.json", ".env", ".env.local",
      "vite.config.ts", "webpack.config.js", "tailwind.config.js",
      "tailwind.config.ts", "postcss.config.js",
    ];

    const found: string[] = [];
    for (const file of candidates) {
      try {
        await stat(join(this.projectRoot, file));
        found.push(file);
      } catch {
        // doesn't exist
      }
    }
    return found;
  }

  private async findLogFiles(): Promise<string[]> {
    const dirs = ["logs", ".next/server", "dist", "tmp"];
    const logFiles: string[] = [];

    for (const dir of dirs) {
      try {
        const fullPath = join(this.projectRoot, dir);
        const dirStat = await stat(fullPath);
        if (!dirStat.isDirectory()) continue;

        const files = await readdir(fullPath);
        for (const file of files) {
          if (file.endsWith(".log")) {
            logFiles.push(join(dir, file));
          }
        }
      } catch {
        // skip
      }
    }

    return logFiles;
  }

  private detectFrameworkFromCommand(command: string): Framework {
    if (command.includes("next")) return "nextjs";
    if (command.includes("nest")) return "nestjs";
    if (command.includes("react-scripts") || command.includes("vite")) return "react";
    return "unknown";
  }

  private async findPortForPid(pid: number): Promise<number | null> {
    try {
      const { stdout } = await execAsync(
        `lsof -iTCP -sTCP:LISTEN -P -n -p ${pid} 2>/dev/null | tail -1`
      );
      const portRegex = /:(\d+)\s/;
      const portMatch = portRegex.exec(stdout);
      return portMatch ? parseInt(portMatch[1], 10) : null;
    } catch {
      return null;
    }
  }
}
