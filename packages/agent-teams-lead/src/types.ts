export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
] as const;

export const MESSAGE_KINDS = [
  "info",
  "question",
  "answer",
  "blocker",
  "decision",
] as const;

export const ARTIFACT_TYPES = ["markdown", "json", "code"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface Team {
  id: string;
  objective: string;
  created_at: string;
  teammates: Teammate[];
}

export interface Teammate {
  id: string;
  name: string;
  role: string;
  agent: string;
  mcp_servers?: string[];
  status: "active" | "idle" | "removed";
  registered_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
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

export interface Message {
  id: string;
  from: string;
  from_name: string;
  to: string | "broadcast" | "lead";
  thread?: string;
  kind: MessageKind;
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
  type: ArtifactType;
  created_at: string;
}
