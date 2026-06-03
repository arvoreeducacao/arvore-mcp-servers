# @arvoretech/google-drive-mcp

MCP server for Google Drive — list, search, download, upload, and manage files from your AI assistant. OAuth user flow (no service account required).

## Tools

| Tool                   | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `files_list`           | List/search files using Drive query syntax (`name contains 'X'`, `mimeType=...`, `'<id>' in parents`)    |
| `files_get`            | Get a file's metadata                                                                                    |
| `files_download`       | Download a file to an absolute local path. Supports Google Docs/Sheets/Slides export                     |
| `files_upload`         | Upload a local file (with optional folder destination)                                                   |
| `files_update_content` | Replace the content of an existing file with bytes from a local path                                     |
| `files_create_folder`  | Create a folder                                                                                          |
| `files_move`           | Move and/or rename                                                                                       |
| `files_delete`         | Trash (default) or permanently delete (gated)                                                            |
| `files_share`          | Add a permission (gated by `GDRIVE_MCP_ALLOW_SHARE=true`)                                                |
| `extract_images`       | Download image files and return them as image content blocks for the model to analyze (Slack/Linear style) |
| `about_get`            | Authenticated user info + storage quota                                                                  |

Shared Drives are supported by default — calls use `supportsAllDrives=true` and `corpora=allDrives` so files in Shared Drives appear in `files_list`.

## Setup

### 1. Create OAuth Client in Google Cloud Console

1. Open the [Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select or create a project
3. Enable the [Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
4. Open **OAuth consent screen**:
   - User type: **External**
   - Add yourself under **Test users** (required while the app is in testing mode)
5. Open **Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Desktop app**
   - Save the `client_id` and `client_secret`

### 2. Authorize

```bash
export GDRIVE_MCP_CLIENT_ID="your-client-id"
export GDRIVE_MCP_CLIENT_SECRET="your-client-secret"

npx @arvoretech/google-drive-mcp auth login
```

This opens your browser, you sign in and approve the Drive scope, and the MCP captures the refresh token. Credentials are encrypted at rest (AES-256-GCM) with the key stored in:

- macOS: the system keychain (`security` utility, service `arvoretech-google-drive-mcp`)
- Other platforms: a file at `~/.config/arvoretech-google-drive-mcp/.encryption_key` (mode 0600)

### 3. Use as MCP server

Add to your MCP client config (Kiro, Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-drive-mcp"],
      "env": {
        "GDRIVE_MCP_CLIENT_ID": "your-client-id",
        "GDRIVE_MCP_CLIENT_SECRET": "your-client-secret",
        "GDRIVE_MCP_ALLOW_SHARE": "false",
        "GDRIVE_MCP_ALLOW_PERMANENT_DELETE": "false"
      }
    }
  }
}
```

## Subcommands

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `google-drive-mcp auth login`    | Browser-based OAuth flow                 |
| `google-drive-mcp auth logout`   | Revoke refresh token and clear credentials |
| `google-drive-mcp auth status`   | Print current auth status                |
| `google-drive-mcp` (no args)     | Run as MCP stdio server                  |

## Environment Variables

| Variable                              | Required | Description                                                            |
| ------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `GDRIVE_MCP_CLIENT_ID`                | Yes      | OAuth client ID from Google Cloud Console                              |
| `GDRIVE_MCP_CLIENT_SECRET`            | Yes      | OAuth client secret                                                    |
| `GDRIVE_MCP_ALLOW_SHARE`              | No       | Set to `true` to enable `files_share`                                  |
| `GDRIVE_MCP_ALLOW_PERMANENT_DELETE`   | No       | Set to `true` to allow `files_delete` with `permanent=true`            |
| `GDRIVE_MCP_REFRESH_TOKEN`            | No       | Bypass the token store and use a refresh token directly (CI / Docker) |
| `GDRIVE_MCP_CONFIG_DIR`               | No       | Override config directory (default: `~/.config/arvoretech-google-drive-mcp`) |
| `GDRIVE_MCP_REDIRECT_PORT`            | No       | Force a specific port for the OAuth callback (default: random)         |
| `GDRIVE_MCP_LOGIN_HINT`               | No       | Pre-fill the email address in the consent screen                       |

## OAuth Scopes

The MCP requests the full Drive scope (`https://www.googleapis.com/auth/drive`) so it can read, create, modify, and delete files. To restrict access, edit `DEFAULT_SCOPES` in `src/oauth.ts` before `auth login` and re-authorize. Common alternatives:

- `https://www.googleapis.com/auth/drive.file` — only files created or opened by this app
- `https://www.googleapis.com/auth/drive.readonly` — read-only access

## Downloading Google-native files

Google Docs, Sheets, Slides, and Drawings are exported on download. Pass `exportMimeType` to `files_download` (defaults below):

| Drive type     | Default export                                                                                |
| -------------- | --------------------------------------------------------------------------------------------- |
| Google Docs    | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)             |
| Google Sheets  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)                   |
| Google Slides  | `application/vnd.openxmlformats-officedocument.presentationml.presentation` (.pptx)           |
| Google Drawing | `image/png`                                                                                    |

Other useful export types: `application/pdf`, `text/csv`, `text/plain`, `text/html`, `application/rtf`, `application/zip`.

## Headless / CI usage

For environments without a browser or keychain (Docker, EKS, GitHub Actions):

1. Run `google-drive-mcp auth login` once on a machine with a browser.
2. Read the refresh token from the saved credentials and pass it through:

```bash
export GDRIVE_MCP_CLIENT_ID="..."
export GDRIVE_MCP_CLIENT_SECRET="..."
export GDRIVE_MCP_REFRESH_TOKEN="1//0g..."
google-drive-mcp
```

When `GDRIVE_MCP_REFRESH_TOKEN` is set, the disk store is bypassed entirely.

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
- `files_share` is gated behind `GDRIVE_MCP_ALLOW_SHARE` so an agent can't grant access without you opting in.
- `files_delete` with `permanent=true` is gated behind `GDRIVE_MCP_ALLOW_PERMANENT_DELETE`. Default is trash (reversible).

## License

MIT
