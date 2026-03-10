# @arvoretech/agent-teams-lead-mcp

MCP server for the **team lead** — spawn and coordinate multiple AI agent sessions working together as a team.

Inspired by [Anthropic's agent teams for Claude Code](https://code.claude.com/docs/en/agent-teams), built as an editor-agnostic MCP layer that works with Kiro, Cursor, Claude Code, and OpenCode.

## Tools

| Tool | Description |
|------|-------------|
| `spawn_team` | Create a team with an objective and list of teammates (each referencing an agent file) |
| `create_task` | Add a task to the shared list with optional dependencies and exclusive file paths |
| `add_teammate` | Add a new teammate to an active team |
| `remove_teammate` | Remove a teammate and stop their process |
| `team_status` | Check team progress, task states, and unread messages |
| `send_message` | Send a message to a specific teammate or broadcast to all |
| `wait_for_team` | Block until all tasks are resolved or all teammates finish |
| `read_artifact` | Read an output published by a teammate |

## How It Works

The lead MCP spawns teammates as CLI processes (e.g., `kiro-cli`, `claude`, `opencode`). Each teammate gets the `agent-teams-teammate` MCP injected automatically. Coordination happens through shared JSON files on disk:

- `tasks.json` — shared task list with dependencies and exclusive file paths
- `messages.json` — inter-agent messaging (direct, broadcast, or to lead)
- `artifacts.json` — outputs published by teammates linked to tasks
- `team.log` — audit log of all teammate activity

All state lives in `.agent-teams/` at the workspace root.

## Configuration

```json
{
  "mcpServers": {
    "agent-teams-lead": {
      "command": "npx",
      "args": ["-y", "@arvoretech/agent-teams-lead-mcp"],
      "env": {
        "WORKSPACE_PATH": "/path/to/your/workspace"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WORKSPACE_PATH` | Yes | Absolute path to the workspace root |

## Usage with Repo Hub

Add to your `hub.yaml`:

```yaml
mcps:
  - name: agent-teams-lead
    package: "@arvoretech/agent-teams-lead-mcp"
```

Run `hub generate` — the orchestrator automatically receives team lead instructions when the MCP is detected.
