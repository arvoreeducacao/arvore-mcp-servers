import { Box, Text } from "ink";
import { colors, kindColors } from "../theme.js";
import type { Message } from "../store.js";

interface Props {
  messages: Message[];
}

const AGENT_COLORS = [
  colors.cyan,
  colors.purple,
  colors.yellow,
  colors.brand,
  colors.blue,
  colors.red,
];

function getColor(name: string, seen: Map<string, string>): string {
  if (seen.has(name)) return seen.get(name)!;
  const color = AGENT_COLORS[seen.size % AGENT_COLORS.length];
  seen.set(name, color);
  return color;
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export function MessagesView({ messages }: Props) {
  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <Box>
        <Text color={colors.muted}>No messages yet.</Text>
      </Box>
    );
  }

  const nameColors = new Map<string, string>();
  let lastDate = "";
  let lastFrom = "";

  return (
    <Box flexDirection="column">
      {sorted.map((msg) => {
        const color = getColor(msg.from_name, nameColors);
        const date = formatDate(msg.created_at);
        const showDate = date !== lastDate;
        lastDate = date;
        const showName = msg.from_name !== lastFrom;
        lastFrom = msg.from_name;

        const target =
          msg.to === "broadcast"
            ? ""
            : msg.to === "lead"
              ? " > lead"
              : ` > ${msg.to}`;

        return (
          <Box key={msg.id} flexDirection="column">
            {showDate && (
              <Box justifyContent="center" marginTop={1} marginBottom={1}>
                <Text color={colors.dim}>-- {date} --</Text>
              </Box>
            )}

            {showName && (
              <Box marginTop={showDate ? 0 : 1}>
                <Text color={color} bold>
                  {msg.from_name}
                </Text>
                <Text color={colors.dim}>{target}</Text>
              </Box>
            )}

            <Box paddingLeft={2} flexDirection="column">
              <Box>
                <Text color={kindColors[msg.kind] || colors.muted}>
                  [{msg.kind}]
                </Text>
                <Text color={colors.white} bold>
                  {" "}
                  {msg.subject}
                </Text>
                <Text color={colors.dim}> {formatTime(msg.created_at)}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={colors.white} wrap="wrap">
                  {msg.body}
                </Text>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
