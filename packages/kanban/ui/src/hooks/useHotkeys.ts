import { useEffect } from "react";

type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

export function useHotkeys(hotkeys: HotkeyMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const key = e.key;

      if (key === "Escape" && hotkeys["Escape"]) {
        hotkeys["Escape"](e);
        return;
      }

      if (isInput) return;

      const handler = hotkeys[key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hotkeys]);
}
