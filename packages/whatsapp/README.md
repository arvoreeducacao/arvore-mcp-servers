# @arvoretech/whatsapp-mcp

WhatsApp MCP server using [Baileys](https://github.com/WhiskeySockets/Baileys). Drives a single WhatsApp account from your AI agent over the official WhatsApp Web protocol.

## What it does

- Pairs a phone via QR code (one device, single user, multi-device protocol).
- Sends and receives text, images, audio (PTT or normal), video, and documents.
- Persists chat metadata, messages, and contacts in a local SQLite database so the agent can recall past conversations.
- Exposes tools to set typing presence, mark messages as read, react, edit, and delete.

Auth state lives at `~/.arvore-mcp/whatsapp/auth/` (override with `WHATSAPP_MCP_DATA_DIR`). The SQLite DB and pairing QR PNG live in the same folder.

## First-time pairing

1. Add the server to your MCP config (see below) and restart the agent.
2. Ask the agent to call `connect`.
3. The server prints an ASCII QR code to stderr and writes a PNG to `~/.arvore-mcp/whatsapp/qr.png`.
4. Open WhatsApp on your phone, go to **Settings → Linked Devices → Link a Device** and scan the QR.
5. After pairing, auth state is saved. Future `connect` calls reconnect silently.

The agent can also call `qr_code` to retrieve the pairing QR in `ascii`, `png` (file path), `data_url` (inline base64), or `raw` (the underlying string).

## Tools

| Tool | What it does |
|------|--------------|
| `connect` | Start the WhatsApp socket. Generates a QR code if no auth state exists. Set `waitForOpen=true` to block until paired. |
| `status` | Report current connection state (`connecting`, `qr`, `open`, `close`), phone number, and QR availability. |
| `qr_code` | Fetch the pairing QR in `ascii`, `png`, `data_url`, or `raw` form. |
| `disconnect` | Close the socket without losing auth state. You can reconnect later without scanning QR. |
| `logout` | Wipe local auth state. Requires `confirm: true`. The phone-side session must also be unlinked separately to fully revoke access. |
| `send_text` | Send a text message. Supports replies via `quotedMessageId`. Brazilian numbers are normalized automatically. |
| `send_media` | Send image, audio, video, or document via `filePath` (absolute path on disk) or `base64`. Audio defaults to push-to-talk. |
| `send_reaction` | React to a message with an emoji. Pass an empty string to remove a previous reaction. |
| `mark_read` | Mark messages as read on WhatsApp and reset the local unread counter. |
| `list_chats` | List recent chats with last message preview and unread count. |
| `get_messages` | Fetch chat history (paginated by `beforeTimestamp`, oldest first). |
| `search_messages` | Substring search across all stored messages. |
| `search_contacts` | Fuzzy contact lookup by name, phone, JID, or LID. |
| `resolve_jid` | Validate a phone number against WhatsApp and return its canonical JID. |
| `edit_message` | Edit one of your own messages. |
| `delete_message` | Delete a message in a chat. Defaults to deleting your own. |

## Recipient formats

Tools that take a `to` argument accept any of:

- A plain phone number with or without formatting: `5511987654321`, `+55 (11) 98765-4321`
- A full JID: `5511987654321@s.whatsapp.net`
- A LID (received from group/channel context): `123456789@lid`

Brazilian mobile numbers are validated against WhatsApp via `onWhatsApp` to handle the optional 9th digit transparently.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `WHATSAPP_MCP_DATA_DIR` | `~/.arvore-mcp/whatsapp` | Folder for auth state, SQLite DB, and QR PNG. |
| `WHATSAPP_LOG_LEVEL` | `warn` | Pino log level for Baileys (`trace`, `debug`, `info`, `warn`, `error`). |

## MCP config

Local development build (no publish required):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": [
        "/absolute/path/to/arvore-mcp-servers/packages/whatsapp/dist/index.js"
      ],
      "env": {
        "WHATSAPP_LOG_LEVEL": "warn"
      },
      "autoApprove": ["*"]
    }
  }
}
```

Once published:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "npx",
      "args": ["-y", "@arvoretech/whatsapp-mcp"],
      "env": {
        "WHATSAPP_LOG_LEVEL": "warn"
      },
      "autoApprove": ["*"]
    }
  }
}
```

## Development

```bash
pnpm install
pnpm --filter @arvoretech/whatsapp-mcp build
pnpm --filter @arvoretech/whatsapp-mcp dev
```

## Notes & gotchas

- **Single connection only.** This MCP drives one WhatsApp account at a time and is intended for personal/agent use cases.
- **Auth dir is per-machine.** Don't ship `~/.arvore-mcp/whatsapp/` — it contains your WhatsApp identity keys.
- **Phone must stay online** occasionally for the multi-device session to stay healthy.
- **Brazilian 9-digit gotcha:** Baileys sometimes returns a JID without the 9 even when you sent with it. The server uses `onWhatsApp` to resolve to the canonical JID before sending and before storing.
- **Group messages are stored** but cannot be sent to yet (no `send_to_group` helper). Add one if needed.
- **No incoming media auto-download.** `messages.upsert` events store metadata, but media is not pulled to disk. Add a `download_media` tool wired to Baileys' message store if you need it.
- **Logout side effect:** `logout` clears local auth state and ends the socket. To fully revoke access, also unlink the device from WhatsApp on your phone.

## Related

- Drives one WhatsApp account from your local agent. For higher-volume server-side use cases, build a dedicated service.
