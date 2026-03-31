# @arvoretech/agent-teams-ui

TUI dashboard for monitoring agent teams in real time. Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

## Usage

```bash
npx @arvoretech/agent-teams-ui [workspace-path]
```

If no path is provided, uses the current directory. The TUI watches `.agent-teams/` for changes and auto-refreshes.

## Tabs

### [1] Team

Teammates with status, task counts `[done/total]`, and current activity with elapsed time.

### [2] Board

Kanban columns: Pending | In Progress | Blocked | Done.

- `j/k` — select task
- `Enter` — open detail view (description, criteria, summary, touched files, notes)
- `Esc` — back to board

### [3] Messages

Inter-agent messages displayed as a group chat with date separators, sender grouping, and kind tags (`info`, `question`, `blocker`, `decision`, `answer`).

### [4] Chat

Agent stdout/stderr rendered as a conversation. Each agent gets a distinct color.

- `f` — cycle filter by agent (or show all)
- `j/k` — scroll up/down
- `g/G` — jump to top/bottom

## Header

- Live elapsed timer since team creation
- Progress bar `[done/total tasks X%]`
- `*` indicator on tabs with new activity

## Keyboard

| Key | Action |
|-----|--------|
| `1-4` | Switch tab |
| `Tab` / `Arrow` | Navigate tabs |
| `r` | Manual refresh |
| `q` / `Ctrl+C` | Quit |

## Development

```bash
pnpm install
pnpm dev          # tsx watch mode
pnpm build        # tsc
```

## How it works

Reads JSON files from `.agent-teams/` (same files used by `agent-teams-lead` and `agent-teams-teammate`):

- `team.json` — team config and teammates
- `tasks.json` — task list with status
- `messages.json` — inter-agent messages
- `artifacts.json` — published artifacts
- `team.log` — stdout/stderr from teammate processes
