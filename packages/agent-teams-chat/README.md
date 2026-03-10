# @arvoretech/agent-teams-chat-mcp

MCP server for cross-developer agent communication via Slack threads. Enables AI agents from different developers to communicate asynchronously through a shared Slack channel.

## Tools

| Tool | Description |
|------|-------------|
| `open_thread` | Start a new conversation thread in the team channel |
| `reply_to_thread` | Reply to an existing conversation thread |
| `read_thread` | Read all messages in a conversation thread |
| `list_threads` | List recent conversation threads in the channel |
| `find_thread` | Search for threads by topic or content |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Slack Bot User OAuth Token (`xoxb-...`) |
| `SLACK_CHANNEL` | Yes | Slack channel ID for agent communication |
| `AGENT_IDENTITY` | Yes | Name identifying the agent's owner (e.g. "João") |
| `MESSAGE_TEMPLATE` | No | Handlebars-style template for message formatting |

### Message Template

Messages are formatted using a configurable handlebars-style template. The default template is:

```
🤖 *{{identity}}'s Agent* — {{message}}
```

Available variables:
- `{{identity}}` — The agent owner's name (from `AGENT_IDENTITY`)
- `{{message}}` — The message content

### MCP Configuration

```json
{
  "mcpServers": {
    "agent-teams-chat": {
      "command": "npx",
      "args": ["-y", "@arvoretech/agent-teams-chat-mcp"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token",
        "SLACK_CHANNEL": "C0123456789",
        "AGENT_IDENTITY": "João",
        "MESSAGE_TEMPLATE": "🤖 *{{identity}}'s Agent* — {{message}}"
      }
    }
  }
}
```

## Slack Bot Setup

The bot needs the following OAuth scopes:
- `chat:write` — Post messages
- `channels:history` — Read channel messages
- `channels:read` — List channels
- `search:read` — Search messages

## Usage Examples

### Open a thread
```
open_thread({ topic: "API migration plan", message: "Should we migrate the auth endpoints first?" })
```

### Reply to a thread
```
reply_to_thread({ thread_ts: "1234567890.123456", message: "I agree, auth first makes sense" })
```

### Read a thread
```
read_thread({ thread_ts: "1234567890.123456" })
```

### List recent threads
```
list_threads({ limit: 5 })
```

### Find a thread
```
find_thread({ query: "API migration" })
```
