# @arvoretech/agent-teams-teammate-mcp

MCP server for **teammates** — claim tasks, communicate with other agents, and publish artifacts.

This MCP is injected automatically into each teammate session when spawned by the lead. You don't need to configure it manually.

## Tools

| Tool | Description |
|------|-------------|
| `whoami` | Get identity, role, team objective, and list of other teammates |
| `list_tasks` | List available tasks, optionally filtered by status |
| `claim_task` | Claim a pending task (with dependency and lock validation) |
| `update_task` | Update status or add notes to an owned task |
| `complete_task` | Mark a task as completed with a summary and touched paths |
| `send_message` | Message another teammate or the lead |
| `fetch_messages` | Check for messages (with unread filter) |
| `ack_messages` | Mark messages as read |
| `write_artifact` | Publish an artifact (markdown, JSON, or code) linked to a task |
| `read_artifact` | Read an artifact by ID |

## How It Works

Each teammate runs as an independent CLI process with its own context window. The teammate MCP provides access to the shared coordination layer:

- **Task claiming** uses `mkdir`-based atomic file locking to prevent race conditions
- **Messaging** supports typed messages: `info`, `question`, `answer`, `blocker`, `decision`
- **Artifacts** are outputs linked to tasks that the lead or other teammates can read

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TEAMMATE_ID` | Yes | Unique identifier for this teammate (set by the lead) |
| `TEAMMATE_NAME` | Yes | Display name for this teammate (set by the lead) |
| `WORKSPACE_PATH` | Yes | Absolute path to the workspace root |

All three are set automatically by the lead MCP when spawning a teammate.
