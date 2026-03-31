import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { colors, symbols, statusColors } from "../theme.js";
import type { Task, Teammate } from "../store.js";

interface Props {
  tasks: Task[];
  teammates: Teammate[];
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: colors.muted },
  { key: "in_progress", label: "In Progress", color: colors.blue },
  { key: "blocked", label: "Blocked", color: colors.red },
  { key: "completed", label: "Done", color: colors.brand },
];

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "~";
}

function duration(from: string, to?: string): string {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function TaskDetail({ task, nameMap }: { task: Task; nameMap: Map<string, string> }) {
  return (
    <Box flexDirection="column" paddingLeft={1} gap={1}>
      <Box>
        <Text color={colors.dim}>[Esc] back</Text>
      </Box>
      <Box>
        <Text color={statusColors[task.status] || colors.muted} bold>{task.title}</Text>
        <Text color={colors.dim}> ({task.status})</Text>
      </Box>
      <Box paddingLeft={1} flexDirection="column">
        <Text color={colors.white}>{task.description}</Text>
      </Box>
      {task.assigned_to && (
        <Box paddingLeft={1}>
          <Text color={colors.dim}>assigned: </Text>
          <Text color={colors.cyan}>{nameMap.get(task.assigned_to) || task.assigned_to}</Text>
          <Text color={colors.dim}> {symbols.line} {duration(task.created_at, task.completed_at)}</Text>
        </Box>
      )}
      {task.acceptance_criteria.length > 0 && (
        <Box paddingLeft={1} flexDirection="column">
          <Text color={colors.muted}>criteria:</Text>
          {task.acceptance_criteria.map((c, i) => (
            <Text key={i} color={colors.white}>  - {c}</Text>
          ))}
        </Box>
      )}
      {task.summary && (
        <Box paddingLeft={1} flexDirection="column">
          <Text color={colors.muted}>summary:</Text>
          <Text color={colors.white}>  {task.summary}</Text>
        </Box>
      )}
      {task.touched_paths.length > 0 && (
        <Box paddingLeft={1} flexDirection="column">
          <Text color={colors.muted}>files:</Text>
          {task.touched_paths.map((p, i) => (
            <Text key={i} color={colors.dim}>  {p}</Text>
          ))}
        </Box>
      )}
      {task.notes.length > 0 && (
        <Box paddingLeft={1} flexDirection="column">
          <Text color={colors.muted}>notes:</Text>
          {task.notes.map((n, i) => (
            <Text key={i} color={colors.yellow}>  {n}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function TasksView({ tasks, teammates }: Props) {
  const { stdout } = useStdout();
  const totalWidth = Math.min(stdout?.columns || 80, 120);
  const colWidth = Math.max(10, Math.floor((totalWidth - COLUMNS.length - 1) / COLUMNS.length));
  const nameMap = new Map(teammates.map((t) => [t.id, t.name]));

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const allTasks = [
    ...tasks.filter((t) => t.status === "pending"),
    ...tasks.filter((t) => t.status === "in_progress"),
    ...tasks.filter((t) => t.status === "blocked"),
    ...tasks.filter((t) => t.status === "completed"),
  ];

  useInput((input, key) => {
    if (detailTask) {
      if (key.escape || input === "q") setDetailTask(null);
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
    }
    if (key.downArrow || input === "j") {
      setSelectedIdx((i) => Math.min(Math.max(0, allTasks.length - 1), i + 1));
    }
    if (key.return && allTasks[selectedIdx]) {
      setDetailTask(allTasks[selectedIdx]);
    }
  });

  if (detailTask) {
    return <TaskDetail task={detailTask} nameMap={nameMap} />;
  }

  const grouped: Record<string, Task[]> = {
    pending: [], in_progress: [], blocked: [], completed: [],
  };
  for (const task of tasks) {
    const bucket = grouped[task.status];
    if (bucket) bucket.push(task);
  }

  const maxRows = Math.max(...Object.values(grouped).map((g) => g.length), 1);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={colors.dim}>[j/k] select  [Enter] detail</Text>
      </Box>
      <Box>
        {COLUMNS.map((col, ci) => (
          <Box key={col.key} width={colWidth} flexDirection="column">
            <Box>
              {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
              <Text color={col.color} bold> {col.label} ({grouped[col.key].length})</Text>
            </Box>
            <Box>
              {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
              <Text color={colors.dim}>{symbols.line.repeat(colWidth - (ci > 0 ? 1 : 0))}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      {Array.from({ length: maxRows }).map((_, row) => (
        <Box key={row}>
          {COLUMNS.map((col, ci) => {
            const task = grouped[col.key][row];
            const isSelected = task && allTasks[selectedIdx]?.id === task.id;
            return (
              <Box key={col.key} width={colWidth} flexDirection="column">
                {task ? (
                  <Box flexDirection="column">
                    <Box>
                      {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
                      <Text
                        color={statusColors[task.status] || colors.muted}
                        bold={isSelected}
                        inverse={isSelected}
                      >
                        {" "}{truncate(task.title, colWidth - 3)}
                      </Text>
                    </Box>
                    <Box>
                      {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
                      <Text color={colors.dim}>
                        {"  "}{nameMap.get(task.assigned_to || "") || ""} {duration(task.created_at, task.completed_at)}
                      </Text>
                    </Box>
                    <Box>
                      {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
                      <Text> </Text>
                    </Box>
                  </Box>
                ) : (
                  <Box>
                    {ci > 0 && <Text color={colors.dim}>{symbols.vertical}</Text>}
                    <Text> </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
