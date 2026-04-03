import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function osascript(script: string): Promise<string> {
  const { stdout } = await exec("osascript", ["-e", script], {
    timeout: 15_000,
  });
  return stdout.trim();
}

export interface Tab {
  title: string;
  url: string;
}

export async function listTabs(): Promise<Tab[]> {
  const raw = await osascript(`
tell application "Arc"
    set output to ""
    repeat with w in windows
        repeat with t in tabs of w
            set output to output & (title of t) & "|||" & (URL of t) & "\\n"
        end repeat
    end repeat
    return output
end tell
`);

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [title, url] = line.split("|||");
      return { title: title?.trim() ?? "", url: url?.trim() ?? "" };
    });
}

export async function getActiveTab(): Promise<Tab> {
  const title = await osascript(
    'tell application "Arc" to get the title of active tab of first window'
  );
  const url = await osascript(
    'tell application "Arc" to get the URL of active tab of first window'
  );
  return { title, url };
}

export async function openUrl(url: string): Promise<void> {
  await osascript(`tell application "Arc" to open location "${url}"`);
}

export async function newTab(url: string): Promise<void> {
  await osascript(`
tell application "Arc"
    activate
    open location "${url}"
end tell
`);
}

export async function closeTab(url: string): Promise<boolean> {
  const result = await osascript(`
tell application "Arc"
    repeat with w in windows
        repeat with t in tabs of w
            if URL of t is "${url}" then
                close t
                return "closed"
            end if
        end repeat
    end repeat
    return "not_found"
end tell
`);
  return result === "closed";
}

export async function searchTabs(query: string): Promise<Tab[]> {
  const tabs = await listTabs();
  const q = query.toLowerCase();
  return tabs.filter(
    (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)
  );
}

export async function executeJavaScript(js: string): Promise<string> {
  const escaped = js.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return osascript(`
tell application "Arc"
    tell active tab of first window
        set jsResult to execute javascript "${escaped}"
    end tell
    return jsResult
end tell
`);
}

export async function focusTab(url: string): Promise<boolean> {
  const result = await osascript(`
tell application "Arc"
    activate
    repeat with w in windows
        set tabIndex to 0
        repeat with t in tabs of w
            set tabIndex to tabIndex + 1
            if URL of t is "${url}" then
                set active tab index of w to tabIndex
                return "focused"
            end if
        end repeat
    end repeat
    return "not_found"
end tell
`);
  return result === "focused";
}

export interface Space {
  title: string;
  id: string;
  tabs: Tab[];
}

export async function listSpaces(): Promise<Space[]> {
  const raw = await osascript(`
tell application "Arc"
    set output to ""
    tell first window
        repeat with s in spaces
            set spaceTitle to title of s
            set spaceId to id of s
            set output to output & "SPACE:" & spaceTitle & "|||" & spaceId & "\\n"
            repeat with t in tabs of s
                set output to output & "TAB:" & (title of t) & "|||" & (URL of t) & "\\n"
            end repeat
        end repeat
    end tell
    return output
end tell
`);

  const spaces: Space[] = [];
  let current: Space | null = null;

  for (const line of raw.split("\n").filter(Boolean)) {
    if (line.startsWith("SPACE:")) {
      const [title, id] = line.slice(6).split("|||");
      current = { title: title?.trim() ?? "", id: id?.trim() ?? "", tabs: [] };
      spaces.push(current);
    } else if (line.startsWith("TAB:") && current) {
      const [title, url] = line.slice(4).split("|||");
      current.tabs.push({ title: title?.trim() ?? "", url: url?.trim() ?? "" });
    }
  }

  return spaces;
}

export async function getActiveSpace(): Promise<string> {
  return osascript(`
tell application "Arc"
    tell first window
        return title of active space
    end tell
end tell
`);
}

export async function switchSpace(title: string): Promise<string> {
  const spaces = await listSpaces();
  const index = spaces.findIndex(
    (s) => s.title.toLowerCase() === title.toLowerCase()
  );
  if (index === -1) return "not_found";

  try {
    await osascript(`
tell application "Arc" to activate
delay 0.3
tell application "System Events"
    key code ${[18, 19, 20, 21, 23, 22, 26, 28, 25, 29][index] ?? 18} using control down
end tell
`);
    return "switched";
  } catch {
    return "no_accessibility_permission";
  }
}
