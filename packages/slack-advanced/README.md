# @arvoretech/slack-advanced-mcp

Advanced Slack MCP Server -- sends messages as the authenticated user, with fuzzy user search, smart DMs, writing style analysis, thread extraction, audio transcription (ElevenLabs), and image analysis.

## Setup

### Env vars

| Variable | Required | Description |
|---|---|---|
| `SLACK_USER_TOKEN` | Yes | Slack user OAuth token (`xoxp-...`) |
| `ELEVENLABS_API_KEY` | No | ElevenLabs API key for audio transcription |
| `SLACK_USERS_CACHE_PATH` | No | Path to users cache JSON (default: `~/.slack-advanced-mcp/users_cache.json`) |
| `SLACK_USERS_CACHE_TTL_MINUTES` | No | Cache TTL in minutes (default: 240) |

### Slack App Scopes (User Token Scopes)

`chat:write`, `users:read`, `users.profile:read`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `im:write`, `files:read`, `search:read`

### MCP Config

```json
{
  "mcpServers": {
    "slack-advanced": {
      "command": "npx",
      "args": ["-y", "@arvoretech/slack-advanced-mcp"],
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
| `search_users` | Fuzzy search users by name, email, or display name with disk cache |
| `get_user_profile` | Full user profile (title, status, timezone, avatar) |
| `send_dm` | Send DM resolving user by name/email/ID. Messages sent as you |
| `get_dm_history` | DM history with a user, with pagination |
| `analyze_writing_style` | Writing style metrics (emoji usage, formality, vocabulary, etc.) |
| `get_thread_from_link` | Extract messages from a Slack thread URL |
| `transcribe_audio` | Transcribe audio files shared in Slack (ElevenLabs STT) |
| `analyze_image` | Download and return Slack images for model analysis |
| `get_file_info` | File metadata (name, type, size, permalink) |
