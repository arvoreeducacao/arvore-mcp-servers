# @arvoretech/google-tasks-mcp

MCP server for Google Tasks — the to-do list that lives in Gmail and in the Tasks panel of
Google Calendar. Google ships official MCP servers for Gmail, Drive, Calendar, Chat and People,
but none for Tasks, and the Calendar connector only sees events. This one fills that gap.

Runs over **stdio** (local) or **streamable-http** (remote, with OAuth for claude.ai connectors).

## Tools

| Tool | What it does |
|------|--------------|
| `list_task_lists` | The account's lists. `@default` is "My Tasks" |
| `create_task_list` / `rename_task_list` / `delete_task_list` | Manage lists (delete takes every task with it) |
| `list_tasks` | Open tasks of a list, with filters by due date, completion date and last change |
| `get_task` | One task with notes, due date, status and links |
| `create_task` | New task, optional notes, due date and parent (subtask) |
| `update_task` | Change title, notes, due date (`null` removes it) or status |
| `complete_task` | Mark as done, or reopen with `completed: false` |
| `delete_task` | Delete a task |
| `move_task` | Reorder, nest under another task, or move to another list |
| `clear_completed_tasks` | Hide the completed tasks of a list from the apps |

## The one thing to know: due is a date, not a time

The Tasks API stores only the **date** of `due` and silently drops the time of day. The tools
take `YYYY-MM-DD` and refuse a timestamp, so the model never believes it scheduled a reminder
for 15:00. A task with a time of day set in the Google apps shows up here with the date only.

Tasks completed in the Google apps are *hidden*; `list_tasks` asks for hidden tasks whenever
it includes completed ones, otherwise they would never come back.

## Setup

1. In Google Cloud Console: enable the **Google Tasks API**.
2. For local use, create an **OAuth client (Desktop app)** and mint a refresh token:

```bash
export GTASKS_MCP_CLIENT_ID=...
export GTASKS_MCP_CLIENT_SECRET=...
google-tasks-mcp auth login     # prints the refresh token on stdout
```

3. For a deployment, create an **OAuth client (Web application)** with the redirect URI
   `https://<domain>/oauth/google/callback` and set the `GTASKS_MCP_SIGNIN_*` variables.
   Each person then connects with their own Google account and sees their own tasks.

## Environment

| Var | Required | Notes |
|-----|----------|-------|
| `GTASKS_MCP_CLIENT_ID` / `GTASKS_MCP_CLIENT_SECRET` | stdio | fall back to the sign-in client |
| `GTASKS_MCP_REFRESH_TOKEN` | unless sign-in | from `auth login`, the service identity |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `HOST` / `PORT` | no | http transport only, defaults `0.0.0.0:8080` |
| `MCP_AUTH_TOKEN` | http only | ≥16 chars: service bearer for `/mcp` |
| `MCP_TOKEN_SIGNING_KEY` | recommended | ≥32 chars, **must differ** from `MCP_AUTH_TOKEN`; unset means everyone signs in again after a restart |
| `MCP_PUBLIC_URL` | http only | public origin, used as the OAuth issuer |
| `MCP_OAUTH_ALLOWED_REDIRECT_HOSTS` | no | defaults to the known MCP clients |
| `GTASKS_MCP_SIGNIN_CLIENT_ID` / `_SECRET` | deployment | Web OAuth client — consent becomes Google sign-in |
| `GTASKS_MCP_SIGNIN_DOMAINS` | with sign-in | allowed email domains, e.g. `arvore.com.br` |
| `GTASKS_MCP_SIGNIN_SCOPES` | no | default `https://www.googleapis.com/auth/tasks` |

## Client config

Local (stdio):

```jsonc
{
  "mcpServers": {
    "google-tasks": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-tasks-mcp"],
      "env": {
        "GTASKS_MCP_CLIENT_ID": "...",
        "GTASKS_MCP_CLIENT_SECRET": "...",
        "GTASKS_MCP_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

claude.ai: *Settings → Connectors → Add custom connector*, URL `https://<domain>/mcp`, no
Client ID. The OAuth flow (DCR + PKCE) ends in Google sign-in restricted to the allowed domains.
