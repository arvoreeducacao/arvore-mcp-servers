import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface Teammate {
  id: string;
  name: string;
  role: string;
  agent: string;
  status: string;
  registered_at: string;
}

export interface Team {
  id: string;
  objective: string;
  created_at: string;
  teammates: Teammate[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_to?: string;
  depends_on: string[];
  acceptance_criteria: string[];
  notes: string[];
  touched_paths: string[];
  created_at: string;
  completed_at?: string;
  summary?: string;
}

export interface Message {
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

export interface Artifact {
  id: string;
  task_id: string;
  agent_id: string;
  agent_name: string;
  name: string;
  content: string;
  type: string;
  created_at: string;
}

export interface TeamState {
  team: Team | null;
  tasks: Task[];
  messages: Message[];
  artifacts: Artifact[];
  log: string[];
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readLog(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadState(workspacePath: string): Promise<TeamState> {
  const base = join(workspacePath, ".agent-teams");
  const [team, tasks, messages, artifacts, log] = await Promise.all([
    readJson<Team | null>(join(base, "team.json"), null),
    readJson<Task[]>(join(base, "tasks.json"), []),
    readJson<Message[]>(join(base, "messages.json"), []),
    readJson<Artifact[]>(join(base, "artifacts.json"), []),
    readLog(join(base, "team.log")),
  ]);
  return { team, tasks, messages, artifacts, log };
}
