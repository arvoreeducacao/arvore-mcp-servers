import type { CardSession } from "../types";
import { cn } from "../lib/utils";

interface SessionBadgeProps {
  session?: CardSession;
  sessionId?: string;
  sessionStatus?: string;
}

export function SessionBadge({
  session,
  sessionId,
  sessionStatus,
}: SessionBadgeProps) {
  const isActive =
    session?.status === "active" || sessionStatus === "active";
  const id = session?.id || sessionId;

  if (!id) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        isActive
          ? "bg-session-active/15 text-session-active"
          : "bg-surface-overlay text-text-dim"
      )}
    >
      {isActive && (
        <span className="h-1.5 w-1.5 rounded-full bg-session-active animate-pulse-dot" />
      )}
      {id.length > 12 ? id.slice(0, 12) + "…" : id}
    </span>
  );
}
