# @arvoretech/google-chat-mcp

MCP server for Google Chat — manage spaces, members, and messages from your AI assistant.

## Tools

| Tool | Description |
|---|---|
| `spaces_list` | List Google Chat spaces |
| `spaces_get` | Get space details |
| `members_list` | List space members |
| `messages_list` | List messages with filtering and pagination |
| `messages_get` | Get a specific message |
| `messages_create` | Send a message (supports threads) |
| `messages_delete` | Delete a message |

## Authentication

Uses Google Service Account with JWT-based auth (no external dependencies — built on `node:crypto`).

**Two modes:**

- **Bot mode** (default): Uses `chat.bot` scope. Access limited to spaces where the bot is added.
- **User mode**: Uses domain-wide delegation to impersonate a user. Full access to spaces, members, and messages.

### Setup

1. Create a service account in [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Enable the [Google Chat API](https://console.cloud.google.com/apis/library/chat.googleapis.com)
3. Download the service account JSON key
4. (For user mode) Enable [domain-wide delegation](https://developers.google.com/workspace/guides/create-credentials#optional_set_up_domain-wide_delegation_for_a_service_account) and add the required scopes in the Google Workspace Admin Console

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CHAT_CREDENTIALS_PATH` | Yes* | Path to service account JSON key file |
| `GOOGLE_CHAT_CREDENTIALS_JSON` | Yes* | Service account JSON as string (alternative to PATH) |
| `GOOGLE_CHAT_USER_EMAIL` | No | Email to impersonate via domain-wide delegation (enables user mode) |
| `GOOGLE_CHAT_SCOPES` | No | Comma-separated OAuth scopes (auto-detected based on mode) |

\* One of `GOOGLE_CHAT_CREDENTIALS_PATH` or `GOOGLE_CHAT_CREDENTIALS_JSON` is required. `GOOGLE_APPLICATION_CREDENTIALS` is also accepted as a fallback for PATH.

### Default Scopes

**Bot mode** (no `GOOGLE_CHAT_USER_EMAIL`):
- `https://www.googleapis.com/auth/chat.bot`

**User mode** (with `GOOGLE_CHAT_USER_EMAIL`):
- `https://www.googleapis.com/auth/chat.spaces.readonly`
- `https://www.googleapis.com/auth/chat.messages`
- `https://www.googleapis.com/auth/chat.memberships.readonly`

## Configuration

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "google-chat": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-chat-mcp"],
      "env": {
        "GOOGLE_CHAT_CREDENTIALS_PATH": "/path/to/service-account.json",
        "GOOGLE_CHAT_USER_EMAIL": "user@yourdomain.com"
      }
    }
  }
}
```

### Bot mode (no impersonation)

```json
{
  "mcpServers": {
    "google-chat": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-chat-mcp"],
      "env": {
        "GOOGLE_CHAT_CREDENTIALS_PATH": "/path/to/service-account.json"
      }
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev      # Run in dev mode
pnpm build    # Compile TypeScript
pnpm test     # Run tests
pnpm lint     # Lint
```

## License

MIT
