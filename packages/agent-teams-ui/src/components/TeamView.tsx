import { Box, Text } from "ink";
import { colors, symbols, statusColors } from "../theme.js";
import type { Team, Task } from "../store.js";

interface Props {
  team: Team;
  tasks: Task[];
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

export function TeamView({ team, tasks }: Props) {
  const tasksByAssignee = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.assigned_to || "unassigned";
    const list = tasksByAssignee.get(key) || [];
    list.push(task);
    tasksByAssignee.set(key, list);
  }

  const active = team.teammates.filter((t) => t.status !== "removed");

  return (
    <Box flexDirection="column" gap={1}>
      <Text color={colors.white} bold>Teammates ({active.length})</Text>

      {active.map((t) => {
        const assigned = tasksByAssignee.get(t.id) || [];
        const current = assigned.find((tk) => tk.status === "in_progress");
        const doneCount = assigned.filter((tk) => tk.status === "completed").length;
        const totalAssigned = assigned.length;

        return (
          <Box key={t.id} flexDirection="column" paddingLeft={1}>
            <Box>
              <Text color={statusColors[t.status] || colors.muted}>{symbols.dot} </Text>
              <Text color={colors.white} bold>{t.name}</Text>
              <Text color={colors.dim}> {t.role}</Text>
              {totalAssigned > 0 && (
                <Text color={colors.muted}> [{doneCount}/{totalAssigned}]</Text>
              )}
            </Box>
            {current && (
              <Box paddingLeft={3}>
                <Text color={colors.blue}>{symbols.arrow} {current.title}</Text>
                <Text color={colors.dim}> {duration(current.created_at)}</Text>
              </Box>
            )}
            {!current && doneCount > 0 && doneCount === totalAssigned && (
              <Box paddingLeft={3}>
                <Text color={colors.brand}>{symbols.check} all tasks done</Text>
              </Box>
            )}
            {!current && doneCount === 0 && totalAssigned === 0 && (
              <Box paddingLeft={3}>
                <Text color={colors.muted}>waiting for tasks</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
