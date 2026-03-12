import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Props {
  logs: string;
}

export function LogViewer({ logs }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      ref={ref}
      className="max-h-[75vh] overflow-y-auto font-mono text-[11px] leading-7 rounded-lg bg-white/[0.01] border border-white/[0.03] p-4"
    >
      {logs ? (
        logs.split("\n").map((line, i) => {
          if (!line.trim()) return null;
          let c = "text-white/12";
          if (line.includes("stderr:")) c = "text-amber-400/25";
          if (/error|Error/.test(line)) c = "text-red-400/30";
          if (line.includes("stdout:")) c = "text-white/20";
          if (line.includes("spawned") || line.includes("started")) c = "text-emerald-400/25";
          return (
            <div key={i} className={`${c} hover:text-white/50 transition-colors duration-100`}>
              {line}
            </div>
          );
        })
      ) : (
        <p className="text-white/8 text-center py-20">no logs</p>
      )}
    </motion.div>
  );
}
