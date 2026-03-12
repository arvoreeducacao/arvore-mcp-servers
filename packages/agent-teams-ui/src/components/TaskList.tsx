import { useState, useEffect } from "react";
import type { Task, Teammate } from "../types";

interface Props {
  tasks: Task[];
  teammates: Teammate[];
}

function LiveTimer({ since }: { since: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      setText(h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span className="font-mono text-blue-400/60">{text}</span>;
}

const DOT: Record<string, string> = {
  pending: "bg-white/20",
  in_progress: "bg-blue-400",
  completed: "bg-emerald-400",
  blocked: "bg-red-400",
};

export function TaskList({ tasks, teammates }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const name = (id?: string) => teammates.find((t) => t.id === id)?.name;

  return (
    <div>
      {tasks.map((task) => {
        const expanded = open === task.id;
        const assignee = name(task.assigned_to);

        return (
          <div key={task.id} className="group">
            <button
              onClick={() => setOpen(expanded ? null : task.id)}
              className="w-full text-left py-4 flex items-start gap-4 border-b border-white/[0.03] hover:border-white/[0.06] transition-colors duration-150"
            >
              <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${DOT[task.status]} ${task.status === "in_progress" ? "animate-breathe" : ""}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] leading-snug ${task.status === "completed" ? "text-white/30 line-through decoration-white/10" : "text-white/80"}`}>
                  {task.title}
                </p>
                {assignee && (
                  <p className="text-[11px] text-white/20 mt-1 font-mono">{assignee}</p>
                )}
              </div>
              <div className="shrink-0 text-[11px] mt-0.5">
                {task.status === "in_progress" && <LiveTimer since={task.created_at} />}
                {task.status === "completed" && task.completed_at && (
                  <span className="text-white/15 font-mono">
                    {(() => {
                      const m = Math.floor((new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 60000);
                      return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m`;
                    })()}
                  </span>
                )}
              </div>
            </button>

            {expanded && (
              <div className="pl-5 pb-6 pt-2 border-b border-white/[0.03]">
                <div className="pl-4 border-l border-white/[0.06] space-y-4">
                  <p className="text-[12px] text-white/30 leading-relaxed max-w-xl">
                    {task.description.length > 400
                      ? task.description.slice(0, 400) + "..."
                      : task.description}
                  </p>

                  {task.summary && (
                    <div className="bg-emerald-500/[0.04] border border-emerald-500/[0.08] rounded-lg px-4 py-3">
                      <p className="text-[12px] text-emerald-400/80 leading-relaxed">
                        {task.summary}
                      </p>
                    </div>
                  )}

                  {task.notes.length > 0 && task.notes.map((n, i) => (
                    <p key={i} className="text-[11px] text-white/20 pl-3 border-l-2 border-white/[0.04]">{n}</p>
                  ))}

                  {task.touched_paths.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {task.touched_paths.map((p) => (
                        <span key={p} className="text-[10px] font-mono text-white/20 bg-white/[0.03] px-2 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {task.acceptance_criteria.length > 0 && (
                    <div className="space-y-1.5">
                      {task.acceptance_criteria.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-white/25">
                          <span className={`mt-0.5 w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                            task.status === "completed"
                              ? "border-emerald-500/30 text-emerald-400"
                              : "border-white/[0.08]"
                          }`}>
                            {task.status === "completed" && <span className="text-[7px]">&#x2713;</span>}
                          </span>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
