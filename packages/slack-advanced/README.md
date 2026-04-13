# @arvoretech/slack-advanced-mcp

Advanced Slack MCP Server — sends messages as the authenticated user, with fuzzy user search, smart DMs, writing style analysis, thread extraction, audio transcription (ElevenLabs), and image analysis.

## Setup

### Env vars

| Variable | Required | Description |
|---|---|---|
| `SLACK_USER_TOKEN` | ✅ | Slack user OAuth token (`xoxp-...`) |
| `ELEVENLABS_API_KEY` | ❌ | ElevenLabs API key for audio transcription |

### Slack App Scopes (User Token Scopes)

`chat:write`, `users:read`, `users.profile:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `im:write`, `files:read`, `search:read`

### MCP Config

```json
{
  "mcpServers": {
    "slack-advanced": {
      "command": "node",
      "args": ["./arvore-mcp-servers/packages/slack-advanced/dist/index.js"],
      "env": {
        "SLACK_USER_TOKEN": "xoxp-...",
        "ELEVENLABS_API_KEY": "sk_..."
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `search_users` | Fuzzy search users by name, email, or display name |
| `get_user_profile` | Full user profile (title, status, timezone, avatar) |
| `send_dm` | Send DM resolving user by name/email/ID. Messages sent as you |
| `get_dm_history` | DM history with a user, with pagination |
| `analyze_writing_style` | Writing style metrics (emoji usage, formality, vocabulary, etc.) |
| `get_thread_from_link` | Extract messages from a Slack thread URL |
| `transcribe_audio` | Transcribe audio files shared in Slack (ElevenLabs STT) |
| `analyze_image` | Download and return Slack images for model analysis |
| `get_file_info` | File metadata (name, type, size, permalink) |
