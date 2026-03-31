import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { colors } from "../theme.js";

interface Props {
  lines: string[];
}

interface ChatEntry {
  source: string;
  timestamp: string;
  text: string;
}

const AGENT_COLORS = [
  colors.cyan,
  colors.purple,
  colors.yellow,
  colors.brand,
  colors.blue,
  colors.red,
];

function parseLogLine(line: string): ChatEntry | null {
  const match = line.match(/^\[(.+?)\] \[(.+?)\] (.+)$/);
  if (!match) return null;
  return { timestamp: match[1], source: match[2], text: match[3] };
}

function getAgentColor(name: string, seen: Map<string, string>): string {
  if (seen.has(name)) return seen.get(name)!;
  const color = AGENT_COLORS[seen.size % AGENT_COLORS.length];
  seen.set(name, color);
  return color;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

export function ChatView({ lines }: Props) {
  const { stdout } = useStdout();
  const viewHeight = (stdout?.rows || 40) - 10;

  const allEntries = lines.map(parseLogLine).filter((e): e is ChatEntry => e !== null);
  const agents = [...new Set(allEntries.map((e) => e.source))];

  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const filtered = filterAgent
    ? allEntries.filter((e) => e.source === filterAgent)
    : allEntries;

  const visibleStart = Math.max(0, filtered.length - viewHeight - scrollOffset);
  const visibleEnd = filtered.length - scrollOffset;
  const visible = filtered.slice(Math.max(0, visibleStart), Math.max(0, visibleEnd));

  useInput((input, key) => {
    if (input === "f") {
      if (filterAgent === null) {
        setFilterAgent(agents[0] || null);
      } else {
        const idx = agents.indexOf(filterAgent);
        if (idx >= agents.length - 1) {
          setFilterAgent(null);
        } else {
          setFilterAgent(agents[idx + 1]);
        }
      }
      setScrollOffset(0);
    }
    if (key.upArrow || input === "k") {
      setScrollOffset((o) => Math.min(o + 3, Math.max(0, filtered.length - viewHeight)));
    }
    if (key.downArrow || input === "j") {
      setScrollOffset((o) => Math.max(0, o - 3));
    }
    if (input === "g") setScrollOffset(Math.max(0, filtered.length - viewHeight));
    if (input === "G") setScrollOffset(0);
  });

  const agentColors = new Map<string, string>();

  if (allEntries.length === 0) {
    return (
      <Box>
        <Text color={colors.muted}>No activity yet.</Text>
      </Box>
    );
  }

  let lastSource = "";

  return (
    <Box flexDirection="column">
      <Box gap={2}>
        <Text color={colors.dim}>[f] filter: {filterAgent || "all"}</Text>
        <Text color={colors.dim}>[j/k] scroll</Text>
        <Text color={colors.dim}>[g/G] top/bottom</Text>
        {agents.map((a) => {
          const c = getAgentColor(a, agentColors);
          const isActive = filterAgent === a;
          return (
            <Text key={a} color={isActive ? c : colors.dim} bold={isActive}>
              {a}
            </Text>
          );
        })}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {visible.map((entry, i) => {
          const color = getAgentColor(entry.source, agentColors);
          const showName = entry.source !== lastSource;
          lastSource = entry.source;

          const isSystem =
            entry.text.startsWith("Process spawned") ||
            entry.text.startsWith("Agent config") ||
            entry.text.startsWith("Stopping");

          const isOutput =
            entry.text.startsWith("stdout:") || entry.text.startsWith("stderr:");

          const displayText = isOutput
            ? entry.text.replace(/^(stdout|stderr): /, "")
            : entry.text;

          if (isSystem) {
            return (
              <Box key={i} justifyContent="center">
                <Text color={colors.dim} italic>
                  -- {entry.source} {displayText} --
                </Text>
              </Box>
            );
          }

          return (
            <Box key={i} flexDirection="column">
              {showName && (
                <Box marginTop={i > 0 ? 1 : 0}>
                  <Text color={color} bold>{entry.source}</Text>
                  <Text color={colors.dim}> {formatTime(entry.timestamp)}</Text>
                </Box>
              )}
              <Box paddingLeft={2}>
                <Text color={colors.white}>{displayText}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {scrollOffset > 0 && (
        <Box justifyContent="center">
          <Text color={colors.dim}>-- {scrollOffset} lines below --</Text>
        </Box>
      )}
    </Box>
  );
}
