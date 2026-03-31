import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { watch } from "chokidar";
import { join } from "node:path";
import { loadState, type TeamState } from "./store.js";
import { colors, symbols } from "./theme.js";
import { Header } from "./components/Header.js";
import { TeamView } from "./components/TeamView.js";
import { TasksView } from "./components/TasksView.js";
import { MessagesView } from "./components/MessagesView.js";
import { ChatView } from "./components/ChatView.js";

type Tab = "team" | "tasks" | "messages" | "chat";
const TABS: Tab[] = ["team", "tasks", "messages", "chat"];

interface Props {
  workspacePath: string;
}

const EMPTY_STATE: TeamState = {
  team: null,
  tasks: [],
  messages: [],
  artifacts: [],
  log: [],
};

const NO_ACTIVITY: Record<Tab, boolean> = {
  team: false,
  tasks: false,
  messages: false,
  chat: false,
};

export function App({ workspacePath }: Props) {
  const { stdout } = useStdout();
  const height = stdout?.rows || 40;

  const [tab, setTab] = useState<Tab>("team");
  const [state, setState] = useState<TeamState>(EMPTY_STATE);
  const [newActivity, setNewActivity] = useState<Record<Tab, boolean>>(NO_ACTIVITY);

  const prevCounts = useRef({ tasks: 0, messages: 0, log: 0 });

  const refresh = useCallback(async () => {
    const next = await loadState(workspacePath);
    setState((prev) => {
      const activity = { ...NO_ACTIVITY };
      if (next.tasks.length !== prevCounts.current.tasks) activity.tasks = true;
      if (next.tasks.some((t, i) => prev.tasks[i]?.status !== t.status)) activity.team = true;
      if (next.messages.length !== prevCounts.current.messages) activity.messages = true;
      if (next.log.length !== prevCounts.current.log) activity.chat = true;

      prevCounts.current = {
        tasks: next.tasks.length,
        messages: next.messages.length,
        log: next.log.length,
      };

      setNewActivity((old) => ({
        team: old.team || activity.team,
        tasks: old.tasks || activity.tasks,
        messages: old.messages || activity.messages,
        chat: old.chat || activity.chat,
      }));

      return next;
    });
  }, [workspacePath]);

  useEffect(() => {
    refresh();
    const agentTeamsDir = join(workspacePath, ".agent-teams");
    const watcher = watch(agentTeamsDir, { ignoreInitial: true, depth: 0 });
    watcher.on("change", () => refresh());
    watcher.on("add", () => refresh());
    return () => { watcher.close(); };
  }, [workspacePath, refresh]);

  useInput((input, key) => {
    const switchTab = (t: Tab) => {
      setTab(t);
      setNewActivity((old) => ({ ...old, [t]: false }));
    };

    if (input === "1") switchTab("team");
    if (input === "2") switchTab("tasks");
    if (input === "3") switchTab("messages");
    if (input === "4") switchTab("chat");

    if (key.tab || (key.rightArrow && tab !== "tasks" && tab !== "chat")) {
      const idx = TABS.indexOf(tab);
      switchTab(TABS[(idx + 1) % TABS.length]);
    }
    if (key.leftArrow && tab !== "tasks" && tab !== "chat") {
      const idx = TABS.indexOf(tab);
      switchTab(TABS[(idx - 1 + TABS.length) % TABS.length]);
    }

    if (input === "r") refresh();
  });

  if (!state.team) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={colors.brand} bold>agent-teams</Text>
        <Text color={colors.muted}>No active team. Watching .agent-teams/ ...</Text>
        <Text color={colors.dim}>[r] refresh  [q/Ctrl+C] quit</Text>
      </Box>
    );
  }

  const unreadCount = state.messages.filter(
    (m: { to: string; read_by: string[] }) => m.to === "lead" && !m.read_by.includes("lead")
  ).length;

  return (
    <Box flexDirection="column" padding={1} height={height}>
      <Header
        activeTab={tab}
        objective={state.team.objective}
        unreadCount={unreadCount}
        tasks={state.tasks}
        createdAt={state.team.created_at}
        newActivity={newActivity}
      />

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {tab === "team" && <TeamView team={state.team} tasks={state.tasks} />}
        {tab === "tasks" && <TasksView tasks={state.tasks} teammates={state.team.teammates} />}
        {tab === "messages" && <MessagesView messages={state.messages} />}
        {tab === "chat" && <ChatView lines={state.log} />}
      </Box>

      <Box marginTop={1}>
        <Text color={colors.dim}>
          [1-4] tabs {symbols.line} [r] refresh {symbols.line} [q/Ctrl+C] quit
        </Text>
      </Box>
    </Box>
  );
}
