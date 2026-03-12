import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useTeamState } from "./useTeamState";
import { Header } from "./components/Header";
import { Stats } from "./components/Stats";
import { TaskList } from "./components/TaskList";
import { Sidebar } from "./components/Sidebar";
import { Activity } from "./components/Activity";
import { LogViewer } from "./components/LogViewer";

type View = "work" | "activity" | "logs";

export function App() {
  const { state, logs, connected } = useTeamState();
  const [view, setView] = useState<View>("work");

  const teammateNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (state.team) {
      for (const t of state.team.teammates) map[t.id] = t.name;
    }
    return map;
  }, [state.team]);

  if (!state.team) {
    return (
      <>
        <div className="ambient-bg" />
        <div className="min-h-screen flex items-center justify-center relative z-10">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-6 rounded-full border border-white/[0.06] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/10 animate-breathe" />
            </div>
            <p className="text-white/25 text-sm tracking-wide">no active team</p>
            <p className="text-white/10 text-xs mt-2 font-mono">spawn_team to begin</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ambient-bg" />
      <div className="min-h-screen flex flex-col relative z-10">
        <Header connected={connected} view={view} onViewChange={setView} />

        <main className="flex-1 px-6 md:px-12 lg:px-20 pb-16">
          <div className="max-w-[1200px] mx-auto">
            <Stats tasks={state.tasks} team={state.team} />

            <AnimatePresence mode="wait">
              {view === "work" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 mt-12">
                  <TaskList tasks={state.tasks} teammates={state.team.teammates} />
                  <Sidebar
                    teammates={state.team.teammates}
                    tasks={state.tasks}
                    messages={state.messages}
                  />
                </div>
              )}

              {view === "activity" && (
                <div className="mt-12 max-w-3xl">
                  <Activity
                    tasks={state.tasks}
                    messages={state.messages}
                    artifacts={state.artifacts}
                    teammateNames={teammateNames}
                  />
                </div>
              )}

              {view === "logs" && (
                <div className="mt-12">
                  <LogViewer logs={logs} />
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </>
  );
}
