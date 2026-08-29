# @arvoretech/google-docs-mcp

MCP server for Google Docs: create documents, read them as Markdown, and edit them
by character index — the model gets both the cheap way to write a whole document
(Markdown import) and the precise way to change one paragraph of an existing one.

Runs over **stdio** (local) or **streamable-http** (remote).

## Tools

| Tool | What it does |
|------|--------------|
| `list_documents` | Search documents in Drive (name, folder, shared drives) |
| `read_document` | Read the document as **Markdown** — headings, bold, lists, tables, links |
| `outline_document` | Indexed map: every paragraph and table with its **startIndex/endIndex** |
| `create_document` | New blank document, optionally inside a folder |
| `create_document_from_markdown` | Whole formatted document in **one call**, no index math |
| `overwrite_document_from_markdown` | Replace the entire content of an existing document, same URL |
| `copy_document` | Copy a document/template — the branded-document starting point |
| `replace_all_text` | Find-and-replace across the document (template filling) |
| `append_paragraphs` | Append paragraphs with named styles and bullets |
| `insert_text` | Insert raw text at an index, or at the end |
| `delete_range` | Delete the content between two indexes |
| `format_text` | Bold, italic, size, font, colors, links over a range |
| `format_paragraph` | Named style, alignment, indent, spacing, bullets |
| `insert_table` | Insert a table and fill its cells |
| `insert_image` | Insert an image by URL at a size in points |
| `insert_page_break` | Insert a page break |
| `get_document` | Raw Docs API resource (use a `fields` mask) |
| `batch_update_document` | Raw Docs API `batchUpdate` — full power |
| `export_document` | Export as pdf / docx / txt / md / html / odt / rtf / epub |

Typical loops:

- **Writing from scratch:** `create_document_from_markdown`. One call, formatted.
- **Filling a template:** `copy_document` → `replace_all_text`.
- **Editing an existing document:** `read_document` to understand it →
  `outline_document` for the indexes → edit → re-read the outline.

## The one thing to know: indexes move

The Docs API addresses content by character index, and **every edit shifts every index
after it**. Two ways out, in order of preference:

1. Use the tools that need no index: `replace_all_text`, `append_paragraphs`,
   `create_document_from_markdown`.
2. Re-read `outline_document` between edits — or send a single
   `batch_update_document` with the requests ordered from the **highest index to the
   lowest**, so earlier edits never move later ones.

## Setup

1. In Google Cloud Console: enable the **Google Docs API** and the **Google Drive API**,
   then create an **OAuth client (Desktop app)**.
2. Mint a refresh token locally (opens the browser, asks for `auth/documents` + `auth/drive`):

```bash
export GDOCS_MCP_CLIENT_ID=...
export GDOCS_MCP_CLIENT_SECRET=...
google-docs-mcp auth login     # prints the refresh token on stdout
```

3. Keep the token as `GDOCS_MCP_REFRESH_TOKEN`. Revoke with `google-docs-mcp auth logout`.

Identity depends on how the client authenticates. Over **OAuth** (claude.ai connectors) the
server acts as **the person who signed in** — their own Google refresh token travels
encrypted inside the issued token, so documents belong to them. With the static
**`MCP_AUTH_TOKEN`** (Claude Code, curl) it acts as the account behind
`GDOCS_MCP_REFRESH_TOKEN` — the service identity, ideally a bot account.

## Environment

| Var | Required | Notes |
|-----|----------|-------|
| `GDOCS_MCP_CLIENT_ID` | yes | falls back to `GDRIVE_MCP_CLIENT_ID` |
| `GDOCS_MCP_CLIENT_SECRET` | yes | falls back to `GDRIVE_MCP_CLIENT_SECRET` |
| `GDOCS_MCP_REFRESH_TOKEN` | yes | from `auth login` — store as a secret |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `HOST` / `PORT` | no | http transport only, defaults `0.0.0.0:8080` |
| `MCP_AUTH_TOKEN` | http only | ≥16 chars, **required** for http: service bearer for `/mcp` |
| `MCP_TOKEN_SIGNING_KEY` | recommended | ≥32 chars, **must differ** from `MCP_AUTH_TOKEN`: seals OAuth codes and tokens. Unset means a random key per boot |
| `MCP_OAUTH_ALLOWED_REDIRECT_HOSTS` | no | hosts allowed as OAuth redirect target (defaults to the known MCP clients) |
| `MCP_PUBLIC_URL` | http only | public origin of the deployment — used as the OAuth issuer |
| `GDOCS_MCP_SIGNIN_CLIENT_ID` | no | Web OAuth client id — turns the OAuth consent screen into Google sign-in |
| `GDOCS_MCP_SIGNIN_CLIENT_SECRET` | with the above | secret of that Web client |
| `GDOCS_MCP_SIGNIN_DOMAINS` | with sign-in | email domains allowed to authorize a client, e.g. `example.com` |
| `GDOCS_MCP_SIGNIN_SCOPES` | no | scopes asked of each user, default `documents,drive` |
| `GDOCS_MCP_LOGIN_HINT` | no | pre-fills the Google account on `auth login` |

## Client config

Local (stdio):

```jsonc
{
  "mcpServers": {
    "google-docs": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-docs-mcp"],
      "env": {
        "GDOCS_MCP_CLIENT_ID": "...",
        "GDOCS_MCP_CLIENT_SECRET": "...",
        "GDOCS_MCP_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

Deployed (streamable-http) — header auth:

```jsonc
{
  "mcpServers": {
    "google-docs": {
      "url": "https://<domain>/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

claude.ai custom connectors use the built-in OAuth 2.1 flow (DCR + PKCE) — add the
connector with the plain `/mcp` URL and no Client ID. With `GDOCS_MCP_SIGNIN_*` set, the
consent screen is Google sign-in restricted to your domains instead of a token prompt.

## Notes

- Markdown import and export are Google's own conversion. Round-tripping a document
  through Markdown loses what Markdown cannot express: comments, suggestions, page
  setup, columns, footnote placement and exotic styling.
- `overwrite_document_from_markdown` keeps the file id, URL and sharing, and the old
  content stays in *File > Version history* — but comments anchored to replaced text
  become orphaned.
- `read_document` truncates at `maxCharacters` (120k by default) so a long document
  cannot blow up the context by accident.
- `batch_update_document` requests are atomic: one invalid request rejects the batch.
