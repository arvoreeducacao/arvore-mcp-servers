# @arvoretech/gmail-mcp

MCP server for Gmail — read, send, and manage messages from your AI assistant. OAuth user flow (no service account required).

## Tools

| Tool              | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `messages_list`   | List messages with Gmail search syntax (`from:`, `is:unread`, etc.)  |
| `messages_get`    | Get a message with parsed headers and body                           |
| `threads_get`     | Get an entire email thread end-to-end                                |
| `drafts_list`     | List existing drafts                                                 |
| `drafts_create`   | Create a draft (always available, even when sending is disabled)     |
| `drafts_send`     | Send an existing draft (requires `GMAIL_MCP_ALLOW_SEND=true`)        |
| `messages_send`   | Send an email immediately (requires `GMAIL_MCP_ALLOW_SEND=true`)     |
| `messages_modify` | Add/remove labels (mark read, archive, star, etc.)                   |
| `messages_trash`  | Move a message to trash                                              |
| `labels_list`     | List system + user labels                                            |
| `profile_get`     | Get the authenticated user's profile                                 |

Reply threading: `messages_send` and `drafts_create` accept `replyToMessageId` and automatically populate `In-Reply-To`, `References`, and `threadId` so replies show up correctly in Gmail.

## Setup

### 1. Create OAuth Client in Google Cloud Console

1. Open the [Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select or create a project
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
4. Open **OAuth consent screen**:
   - User type: **External**
   - Add yourself under **Test users** (required while the app is in testing mode)
5. Open **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Desktop app**
   - Save the `client_id` and `client_secret`

### 2. Authorize

```bash
export GMAIL_MCP_CLIENT_ID="your-client-id"
export GMAIL_MCP_CLIENT_SECRET="your-client-secret"

npx @arvoretech/gmail-mcp auth login
```

This opens your browser, you sign in and approve scopes, and the MCP captures the refresh token. Credentials are encrypted at rest (AES-256-GCM) with the key stored in:

- macOS: the system keychain (`security` utility)
- Other platforms: a file at `~/.config/arvoretech-gmail-mcp/.encryption_key` (mode 0600)

### 3. Use as MCP server

Add to your MCP client config (Kiro, Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@arvoretech/gmail-mcp"],
      "env": {
        "GMAIL_MCP_CLIENT_ID": "your-client-id",
        "GMAIL_MCP_CLIENT_SECRET": "your-client-secret",
        "GMAIL_MCP_ALLOW_SEND": "false"
      }
    }
  }
}
```

By default the MCP runs in **read + draft mode** — `messages_send` and `drafts_send` are not registered. Set `GMAIL_MCP_ALLOW_SEND=true` only when you trust the agent to send mail without human review.

## Subcommands

| Command                   | Description                              |
| ------------------------- | ---------------------------------------- |
| `gmail-mcp auth login`    | Browser-based OAuth flow                 |
| `gmail-mcp auth logout`   | Revoke refresh token and clear credentials |
| `gmail-mcp auth status`   | Print current auth status                |
| `gmail-mcp` (no args)     | Run as MCP stdio server                  |

## Environment Variables

| Variable                       | Required | Description                                                            |
| ------------------------------ | -------- | ---------------------------------------------------------------------- |
| `GMAIL_MCP_CLIENT_ID`          | Yes      | OAuth client ID from Google Cloud Console                              |
| `GMAIL_MCP_CLIENT_SECRET`      | Yes      | OAuth client secret                                                    |
| `GMAIL_MCP_ALLOW_SEND`         | No       | Set to `true` to enable `messages_send` and `drafts_send` tools        |
| `GMAIL_MCP_REFRESH_TOKEN`      | No       | Bypass the token store and use a refresh token directly (CI / Docker) |
| `GMAIL_MCP_CONFIG_DIR`         | No       | Override config directory (default: `~/.config/arvoretech-gmail-mcp`)  |
| `GMAIL_MCP_REDIRECT_PORT`      | No       | Force a specific port for the OAuth callback (default: random)         |
| `GMAIL_MCP_LOGIN_HINT`         | No       | Pre-fill the email address in the consent screen                       |

## OAuth Scopes

The MCP requests these scopes (well within Google's 25-scope limit for unverified apps):

- `https://www.googleapis.com/auth/gmail.readonly` — read messages and labels
- `https://www.googleapis.com/auth/gmail.send` — send mail
- `https://www.googleapis.com/auth/gmail.modify` — modify labels (mark read, archive, star, trash)
- `https://www.googleapis.com/auth/gmail.compose` — create drafts

To grant fewer permissions, edit `DEFAULT_SCOPES` in `src/oauth.ts` before `auth login` and re-authorize.

## Headless / CI usage

For environments without a browser or keychain (Docker, EKS, GitHub Actions):

1. Run `gmail-mcp auth login` once on a machine with a browser.
2. Read the refresh token from the saved credentials and pass it through:

```bash
export GMAIL_MCP_CLIENT_ID="..."
export GMAIL_MCP_CLIENT_SECRET="..."
export GMAIL_MCP_REFRESH_TOKEN="ya29..."
gmail-mcp
```

When `GMAIL_MCP_REFRESH_TOKEN` is set, the disk store is bypassed entirely.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Security notes

- Refresh tokens are long-lived. Treat them like passwords.
- The encryption key never leaves your machine — it lives in the macOS keychain or a `0600` file.
- `messages_send` is gated behind `GMAIL_MCP_ALLOW_SEND` so an agent can't send mail unless you opt in.
- Always prefer `drafts_create` for AI-generated emails — humans review before sending.

## License

MIT
