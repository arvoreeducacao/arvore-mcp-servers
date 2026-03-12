import { motion } from "framer-motion";
import type { Team, Task } from "../types";

interface Props {
  tasks: Task[];
  team: Team;
}

export function Stats({ tasks, team }: Props) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "completed").length;
  const running = tasks.filter((t) => t.status === "in_progress").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const queued = total - done - running - blocked;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mt-12"
    >
      <p className="text-white/15 text-[13px] mb-8 max-w-xl leading-relaxed">
        {team.objective.length > 120
          ? team.objective.slice(0, 120) + "..."
          : team.objective}
      </p>

      <div className="flex items-end gap-14">
        <div className="relative">
          <span className="text-6xl font-bold text-white tabular-nums tracking-tighter">
            {progress}
          </span>
          <span className="text-xl text-white/15 ml-0.5">%</span>
        </div>

        <div className="flex gap-10 pb-3">
          <Metric value={running} label="running" dotClass="bg-blue-400 status-glow status-glow-blue" />
          <Metric value={blocked} label="blocked" dotClass="bg-red-400 status-glow status-glow-red" />
          <Metric value={done} label="done" dotClass="bg-emerald-400" />
          <Metric value={queued} label="queued" dotClass="bg-white/15" />
        </div>

        <div className="flex-1 pb-4">
          <div className="h-[3px] bg-white/[0.03] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ value, label, dotClass }: { value: number; label: string; dotClass: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`relative w-[6px] h-[6px] rounded-full ${value > 0 ? dotClass : "bg-white/[0.06]"}`} />
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-semibold tabular-nums ${value > 0 ? "text-white/80" : "text-white/10"}`}>
          {value}
        </span>
        <span className="text-[11px] text-white/15">{label}</span>
      </div>
    </div>
  );
}
