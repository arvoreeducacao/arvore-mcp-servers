import { motion } from "framer-motion";

type View = "work" | "activity" | "logs";

interface Props {
  connected: boolean;
  view: View;
  onViewChange: (v: View) => void;
}

const VIEWS: { key: View; label: string }[] = [
  { key: "work", label: "Work" },
  { key: "activity", label: "Activity" },
  { key: "logs", label: "Logs" },
];

export function Header({ connected, view, onViewChange }: Props) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-[#050505]/70 border-b border-white/[0.03]">
      <div className="px-6 md:px-12 lg:px-20 max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-8">
            <span className="text-[13px] font-medium text-white/40 tracking-wide">
              agent teams
            </span>
            <nav className="flex items-center gap-0.5 relative">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => onViewChange(v.key)}
                  className={`relative px-3 py-1 text-[13px] rounded-md transition-colors duration-200 ${
                    view === v.key
                      ? "text-white/90"
                      : "text-white/25 hover:text-white/45"
                  }`}
                >
                  {view === v.key && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-white/[0.06] rounded-md"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{v.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="relative flex items-center justify-center w-4 h-4">
              <span className={`w-[5px] h-[5px] rounded-full relative z-10 ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
              {connected && (
                <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-breathe" />
              )}
            </span>
            <span className="text-[11px] text-white/15 font-mono">
              {connected ? "live" : "off"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
