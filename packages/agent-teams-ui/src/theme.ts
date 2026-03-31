export const colors = {
  brand: "#22c55e",
  blue: "#3b82f6",
  purple: "#a78bfa",
  yellow: "#eab308",
  red: "#ef4444",
  cyan: "#06b6d4",
  muted: "#6b7280",
  dim: "#4b5563",
  white: "#ffffff",
};

export const symbols = {
  check: "✓",
  cross: "✗",
  arrow: ">",
  dot: "●",
  circle: "○",
  line: "─",
  vertical: "│",
  team: "#",
  task: "*",
  message: ">",
  log: "~",
};

export const kindColors: Record<string, string> = {
  info: colors.blue,
  question: colors.yellow,
  answer: colors.brand,
  blocker: colors.red,
  decision: colors.purple,
};

export const statusColors: Record<string, string> = {
  pending: colors.muted,
  in_progress: colors.blue,
  completed: colors.brand,
  blocked: colors.red,
  active: colors.brand,
  removed: colors.dim,
  idle: colors.yellow,
};
