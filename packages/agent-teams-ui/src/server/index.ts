import express from "express";
import cors from "cors";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { watch } from "chokidar";

const workspacePath = process.env.WORKSPACE_PATH || resolve(process.cwd(), "../../..");
const agentTeamsPath = join(workspacePath, ".agent-teams");

const app = express();
app.use(cors());

async function readJson<T>(filename: string, fallback: T): Promise<T> {
  const filePath = join(agentTeamsPath, filename);
  if (!existsSync(filePath)) return fallback;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function getFullState() {
  const [team, tasks, messages, artifacts] = await Promise.all([
    readJson("team.json", null),
    readJson("tasks.json", []),
    readJson("messages.json", []),
    readJson("artifacts.json", []),
  ]);
  return { team, tasks, messages, artifacts };
}

async function getLogTail(lines = 100): Promise<string> {
  const logPath = join(agentTeamsPath, "team.log");
  if (!existsSync(logPath)) return "";
  try {
    const content = await readFile(logPath, "utf-8");
    return content.split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

app.get("/api/state", async (_req, res) => {
  try {
    const state = await getFullState();
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: "Failed to read state" });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const lines = parseInt(req.query.lines as string) || 100;
    const log = await getLogTail(lines);
    res.json({ log });
  } catch {
    res.status(500).json({ error: "Failed to read logs" });
  }
});

const clients: Set<express.Response> = new Set();

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

function broadcast(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

if (existsSync(agentTeamsPath)) {
  const watcher = watch(agentTeamsPath, {
    ignoreInitial: true,
    depth: 0,
  });

  watcher.on("change", async (path) => {
    if (path.endsWith(".json")) {
      const state = await getFullState();
      broadcast({ type: "state", ...state });
    }
    if (path.endsWith(".log")) {
      const log = await getLogTail(20);
      broadcast({ type: "log", log });
    }
  });
}

const port = 3848;
app.listen(port, () => {
  console.log(`Agent Teams UI server running on http://localhost:${port}`);
  console.log(`Watching: ${agentTeamsPath}`);
});
