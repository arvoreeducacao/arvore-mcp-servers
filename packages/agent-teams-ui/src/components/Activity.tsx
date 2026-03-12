import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Task, Message, Artifact } from "../types";

interface Props {
  tasks: Task[];
  messages: Message[];
  artifacts: Artifact[];
  teammateNames: Record<string, string>;
}

interface Event {
  id: string;
  time: string;
  actor: string;
  verb: string;
  detail?: string;
  color: string;
  dotColor: string;
}

function ago(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export function Activity({ tasks, messages, artifacts, teammateNames }: Props) {
  const events = useMemo(() => {
    const all: Event[] = [];

    for (const t of tasks) {
      if (t.status === "completed" && t.completed_at) {
        all.push({
          id: `done-${t.id}`,
          time: t.completed_at,
          actor: teammateNames[t.assigned_to || ""] || "?",
          verb: "completed",
          detail: t.title,
          color: "text-emerald-400/70",
          dotColor: "bg-emerald-400",
        });
      }
      if (t.status === "blocked") {
        all.push({
          id: `block-${t.id}`,
          time: t.created_at,
          actor: teammateNames[t.assigned_to || ""] || "?",
          verb: "blocked on",
          detail: t.title,
          color: "text-red-400/70",
          dotColor: "bg-red-400",
        });
      }
      if (t.assigned_to && t.status === "in_progress") {
        all.push({
          id: `claim-${t.id}`,
          time: t.created_at,
          actor: teammateNames[t.assigned_to] || "?",
          verb: "started",
          detail: t.title,
          color: "text-blue-400/70",
          dotColor: "bg-blue-400",
        });
      }
    }

    for (const m of messages) {
      const verbMap: Record<string, string> = {
        question: "asked",
        blocker: "raised blocker",
        decision: "decided",
        answer: "answered",
        info: "said",
      };
      const colorMap: Record<string, string> = {
        question: "text-amber-400/70",
        blocker: "text-red-400/70",
        decision: "text-violet-400/70",
        answer: "text-emerald-400/70",
        info: "text-white/30",
      };
      const dotMap: Record<string, string> = {
        question: "bg-amber-400",
        blocker: "bg-red-400",
        decision: "bg-violet-400",
        answer: "bg-emerald-400",
        info: "bg-white/20",
      };
      all.push({
        id: `msg-${m.id}`,
        time: m.created_at,
        actor: m.from_name,
        verb: verbMap[m.kind] || "said",
        detail: m.subject,
        color: colorMap[m.kind] || "text-white/30",
        dotColor: dotMap[m.kind] || "bg-white/20",
      });
    }

    for (const a of artifacts) {
      all.push({
        id: `art-${a.id}`,
        time: a.created_at,
        actor: a.agent_name,
        verb: "published",
        detail: a.name,
        color: "text-violet-400/70",
        dotColor: "bg-violet-400",
      });
    }

    return all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [tasks, messages, artifacts, teammateNames]);

  return (
    <div className="relative">
      <div className="absolute left-[3px] top-3 bottom-3 w-px bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-transparent" />

      {events.map((e, i) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.03 }}
          className="relative pl-8 py-3.5 group"
        >
          <div className={`absolute left-0 top-[19px] w-[7px] h-[7px] rounded-full ${e.dotColor} ring-2 ring-[#050505] group-hover:scale-150 transition-transform duration-200`} />
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] text-white/45 font-medium">{e.actor}</span>
            <span className={`text-[12px] ${e.color}`}>{e.verb}</span>
            <span className="text-[11px] text-white/10 font-mono ml-auto">{ago(e.time)}</span>
          </div>
          {e.detail && (
            <p className="text-[12px] text-white/20 mt-0.5 group-hover:text-white/30 transition-colors">{e.detail}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
