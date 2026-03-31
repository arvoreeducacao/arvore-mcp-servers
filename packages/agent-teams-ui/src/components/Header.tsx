import { useState, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { colors, symbols } from "../theme.js";
import type { Task } from "../store.js";
type Tab = "team" | "tasks" | "messages" | "chat";
const TABS: { key: Tab; label: string; shortcut: string }[] = [
  { key: "team", label: "Team", shortcut: "1" },
  { key: "tasks", label: "Board", shortcut: "2" },
  { key: "messages", label: "Messages", shortcut: "3" },
  { key: "chat", label: "Chat", shortcut: "4" },
];
interface Props {
  activeTab: Tab;
  objective: string;
  unreadCount: number;
  tasks: Task[];
  createdAt: string;
  newActivity: Record<Tab, boolean>;
}
function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + (s % 60) + "s";
  const h = Math.floor(m / 60);
  return h + "h " + (m % 60) + "m";
}
export function Header({ activeTab, objective, unreadCount, tasks, createdAt, newActivity }: Props) {
  const { stdout } = useStdout();
  const width = Math.min(stdout?.columns || 80, 120);
  const [elapsedStr, setElapsedStr] = useState(elapsed(createdAt));
  useEffect(() => {
    const id = setInterval(() => setElapsedStr(elapsed(createdAt)), 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  const done = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barW = Math.min(20, width - 40);
  const filled = Math.round((barW * pct) / 100);
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={colors.brand} bold>agent-teams</Text>
        <Text color={colors.dim}> {symbols.line} </Text>
        <Text color={colors.white}>{objective}</Text>
        <Text color={colors.dim}> {symbols.line} </Text>
        <Text color={colors.muted}>{elapsedStr}</Text>
      </Box>
      {total > 0 && (
        <Box>
          <Text color={colors.dim}>[</Text>
          <Text color={colors.brand}>{symbols.line.repeat(filled)}</Text>
          <Text color={colors.dim}>{" ".repeat(Math.max(0, barW - filled))}</Text>
          <Text color={colors.dim}>] </Text>
          <Text color={pct === 100 ? colors.brand : colors.white}>{done}/{total}</Text>
          <Text color={colors.muted}> tasks {pct}%</Text>
        </Box>
      )}
      <Box marginTop={1} gap={1}>
        {TABS.map((t) => {
          const active = t.key === activeTab;
          const hasNew = !active && newActivity[t.key];
          const badge = t.key === "messages" && unreadCount > 0 ? " " + unreadCount : "";
          return (
            <Box key={t.key}>
              <Text color={colors.dim}>[</Text>
              <Text color={active ? colors.brand : colors.dim}>{t.shortcut}</Text>
              <Text color={colors.dim}>]</Text>
              <Text color={active ? colors.brand : hasNew ? colors.yellow : colors.muted} bold={active}>
                {" "}{t.label}{badge}
              </Text>
              {hasNew && <Text color={colors.yellow}>*</Text>}
              <Text> </Text>
            </Box>
          );
        })}
      </Box>
      <Text color={colors.dim}>{symbols.line.repeat(Math.min(width - 2, 80))}</Text>
    </Box>
  );
}
