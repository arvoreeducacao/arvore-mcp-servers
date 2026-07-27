# @arvoretech/google-slides-mcp

MCP server for Google Slides: create decks, edit them, and **look at them** — every
slide can be rendered to PNG and returned as an image, so the model closes the
edit → inspect → fix loop without a human in the middle.

Runs over **stdio** (local) or **streamable-http** (deployed, e.g. Dokploy).

## Tools

| Tool | What it does |
|------|--------------|
| `list_presentations` | Search decks in Drive (name, folder, shared drives) |
| `create_presentation` | New blank deck, optionally inside a folder |
| `copy_presentation` | Copy a deck/template — the branded-deck starting point |
| `summarize_presentation` | Compact deck structure: slides, text, **object ids**, placeholders, notes |
| `get_presentation` | Raw Slides API resource (use a `fields` mask) |
| `get_page` | Raw page resource with exact geometry |
| `get_slide_image` | **Screenshot** a slide as PNG (200 / 800 / 1600px) |
| `add_slide` | Insert a slide from a predefined layout + fill title/subtitle/body |
| `insert_text` | Insert or overwrite text in a shape/table cell |
| `replace_all_text` | Find-and-replace across the deck (template filling) |
| `insert_image` | Place an image by URL at a position/size in points |
| `set_speaker_notes` | Replace a slide's speaker notes |
| `delete_object` | Delete an element or a whole slide |
| `batch_update_presentation` | Raw Slides API `batchUpdate` — full styling/geometry power |
| `export_presentation` | Export as pdf / pptx / txt |

Typical loop: `summarize_presentation` → edit with the typed tools or
`batch_update_presentation` → `get_slide_image` to verify → fix.

## Setup

1. In Google Cloud Console: enable the **Google Slides API** and the **Google Drive API**,
   then create an **OAuth client (Desktop app)**.
2. Mint a refresh token locally (opens the browser, asks for
   `auth/presentations` + `auth/drive`):

```bash
export GSLIDES_MCP_CLIENT_ID=...
export GSLIDES_MCP_CLIENT_SECRET=...
google-slides-mcp auth login     # prints the refresh token on stdout
```

3. Keep the token as `GSLIDES_MCP_REFRESH_TOKEN`. Revoke with
   `google-slides-mcp auth logout`.

Identity depends on how the client authenticates. Over **OAuth** (claude.ai connectors) the
server acts as **the person who signed in** — their own Google refresh token travels
encrypted inside the issued token, so decks belong to them. With the **static
`MCP_AUTH_TOKEN`** (Claude Code, curl) it acts as the account behind
`GSLIDES_MCP_REFRESH_TOKEN` — the service identity, ideally a bot account.

## Environment

| Var | Required | Notes |
|-----|----------|-------|
| `GSLIDES_MCP_CLIENT_ID` | yes | falls back to `GDRIVE_MCP_CLIENT_ID` |
| `GSLIDES_MCP_CLIENT_SECRET` | yes | falls back to `GDRIVE_MCP_CLIENT_SECRET` |
| `GSLIDES_MCP_REFRESH_TOKEN` | yes | from `auth login` — store as a secret |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `HOST` / `PORT` | no | http transport only, defaults `0.0.0.0:8080` |
| `MCP_AUTH_TOKEN` | http only | ≥16 chars, **required** for http: guards `/mcp` and backs the built-in OAuth server |
| `MCP_PUBLIC_URL` | http only | public origin, e.g. `https://google-slides.arvore.dev` — the OAuth issuer |
| `GSLIDES_MCP_SIGNIN_CLIENT_ID` | no | Web OAuth client id — turns the OAuth consent screen into Google sign-in |
| `GSLIDES_MCP_SIGNIN_CLIENT_SECRET` | with the above | secret of that Web client |
| `GSLIDES_MCP_SIGNIN_DOMAINS` | no | allowed email domains, default `arvore.com.br` |
| `GSLIDES_MCP_SIGNIN_SCOPES` | no | scopes asked of each user, default `presentations,drive` |
| `GSLIDES_MCP_LOGIN_HINT` | no | pre-fills the Google account on `auth login` |

## Client config

Local (stdio):

```jsonc
{
  "mcpServers": {
    "google-slides": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-slides-mcp"],
      "env": {
        "GSLIDES_MCP_CLIENT_ID": "...",
        "GSLIDES_MCP_CLIENT_SECRET": "...",
        "GSLIDES_MCP_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

Deployed (streamable-http) — header auth:

```jsonc
{
  "mcpServers": {
    "google-slides": {
      "url": "https://<domain>/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

Clients that accept only a URL can use `https://<domain>/mcp/<MCP_AUTH_TOKEN>`, and
claude.ai custom connectors use the built-in OAuth 2.1 flow (DCR + PKCE) — add the
connector with the plain `/mcp` URL and no Client ID. With `GSLIDES_MCP_SIGNIN_*` set, the
consent screen is Google sign-in restricted to your domains instead of a token prompt.

See [`deploy/README.md`](./deploy/README.md) for the Dokploy setup and the full auth matrix.

## Notes

- Thumbnail URLs from the Slides API live ~30 minutes; the server downloads the PNG
  and returns bytes, so no URL leaks into the transcript.
- `MEDIUM` (800px) is the default screenshot size — enough to judge layout at a
  fraction of the tokens of `LARGE`.
- A 16:9 slide is 720x405 pt; `insert_image` and geometry requests take points.
- `batch_update_presentation` requests are atomic: one invalid request rejects the batch.
