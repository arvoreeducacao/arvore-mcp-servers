import { useState, useEffect, useCallback } from "react";
import type { TeamState } from "./types";

const EMPTY_STATE: TeamState = {
  team: null,
  tasks: [],
  messages: [],
  artifacts: [],
};

export function useTeamState() {
  const [state, setState] = useState<TeamState>(EMPTY_STATE);
  const [logs, setLogs] = useState("");
  const [connected, setConnected] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      setState(data);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?lines=200");
      const data = await res.json();
      setLogs(data.log);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    fetchState();
    fetchLogs();

    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "state") {
          const { type: _, ...rest } = data;
          setState(rest as TeamState);
        }
        if (data.type === "log") {
          setLogs((prev) => prev + "\n" + data.log);
        }
      } catch {
        /* noop */
      }
    };

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => {
      setConnected(false);
      setTimeout(fetchState, 3000);
    };

    const interval = setInterval(() => {
      fetchState();
      fetchLogs();
    }, 5000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [fetchState, fetchLogs]);

  return { state, logs, connected, refresh: fetchState };
}
