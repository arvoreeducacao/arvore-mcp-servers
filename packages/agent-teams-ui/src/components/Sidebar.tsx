import { motion } from "framer-motion";
import type { Teammate, Task, Message } from "../types";

interface Props {
  teammates: Teammate[];
  tasks: Task[];
  messages: Message[];
}

const AVATAR_GRADIENTS = [
  "from-blue-500/20 to-cyan-500/10",
  "from-violet-500/20 to-pink-500/10",
  "from-amber-500/20 to-orange-500/10",
  "from-emerald-500/20 to-teal-500/10",
];

export function Sidebar({ teammates, tasks, messages }: Props) {
  const active = teammates.filter((t) => t.status !== "removed");

  const alerts = messages.filter(
    (m) => m.to === "lead" && (m.kind === "question" || m.kind === "blocker")
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="space-y-10"
    >
      <div>
        <p className="text-[10px] text-white/15 uppercase tracking-[0.2em] mb-5">
          Team
        </p>
        <div className="space-y-4">
          {active.map((t, i) => {
            const current = tasks.find(
              (task) => task.assigned_to === t.id && task.status === "in_progress"
            );
            const done = tasks.filter(
              (task) => task.assigned_to === t.id && task.status === "completed"
            ).length;
            const total = tasks.filter(
              (task) => task.assigned_to === t.id
            ).length;

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-start gap-3 group"
              >
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]} flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-white/[0.04]`}>
                  <span className="text-[11px] font-medium text-white/50">
                    {t.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-white/60 group-hover:text-white/80 transition-colors">{t.name}</span>
                    {total > 0 && (
                      <span className="text-[10px] text-white/15 font-mono">
                        {done}/{total}
                      </span>
                    )}
                  </div>
                  {current ? (
                    <p className="text-[11px] text-blue-400/40 mt-1 truncate">
                      {current.title}
                    </p>
                  ) : (
                    <p className="text-[11px] text-white/10 mt-1 font-mono">idle</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {alerts.length > 0 && (
        <div>
          <p className="text-[10px] text-white/15 uppercase tracking-[0.2em] mb-5">
            Needs attention
          </p>
          <div className="space-y-3">
            {alerts.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                className={`rounded-lg px-4 py-3 border transition-colors duration-200 ${
                  msg.kind === "blocker"
                    ? "bg-red-500/[0.03] border-red-500/[0.06] hover:border-red-500/[0.12]"
                    : "bg-amber-500/[0.03] border-amber-500/[0.06] hover:border-amber-500/[0.12]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`w-[5px] h-[5px] rounded-full ${
                    msg.kind === "blocker" ? "bg-red-400" : "bg-amber-400"
                  }`} />
                  <span className={`text-[9px] font-semibold uppercase tracking-widest ${
                    msg.kind === "blocker" ? "text-red-400/60" : "text-amber-400/60"
                  }`}>
                    {msg.kind}
                  </span>
                  <span className="text-[10px] text-white/10 font-mono ml-auto">
                    {msg.from_name}
                  </span>
                </div>
                <p className="text-[12px] text-white/40 leading-relaxed">
                  {msg.subject}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
