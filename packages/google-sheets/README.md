# @arvoretech/google-sheets-mcp

MCP server for Google Sheets: read ranges, write values and formulas, reshape tabs,
format cells and export — the model works the spreadsheet the way a person does,
in A1 notation, instead of through raw grid indexes.

Runs over **stdio** (local) or **streamable-http** (remote).

## Tools

| Tool | What it does |
|------|--------------|
| `list_spreadsheets` | Search spreadsheets in Drive (name, folder, shared drives) |
| `describe_spreadsheet` | **Start here**: tabs, gids, sizes, named ranges + a preview of the first rows |
| `read_range` | Read one or more A1 ranges (formatted, raw, or the formulas) |
| `create_spreadsheet` | New spreadsheet with named tabs, optionally inside a folder |
| `copy_spreadsheet` | Copy a spreadsheet/template, keeping formulas and charts |
| `write_range` | Write rows of values starting at an A1 range |
| `append_rows` | Append after the last row with data — no need to find the end |
| `clear_range` | Clear values, keep formatting |
| `add_sheet` / `rename_sheet` / `delete_sheet` | Manage tabs |
| `insert_dimension` / `delete_dimension` | Insert or delete rows and columns |
| `sort_range` | Sort a range by one or more columns |
| `format_cells` | Bold, size, font, colors, alignment, wrapping, number format |
| `find_replace` | Find-and-replace across a tab or the whole file, optionally by regex |
| `batch_update_spreadsheet` | Raw Sheets API `batchUpdate` — charts, borders, validation, filters |
| `export_spreadsheet` | Export as pdf / xlsx / csv |

Typical loop: `describe_spreadsheet` → `read_range` on what matters →
`write_range` / `append_rows` → `format_cells`.

## Two things to know

**`USER_ENTERED` is the default write mode.** Values are parsed the way they would be
if a person typed them: `=SUM(A1:A9)` becomes a formula, `28/08/2026` becomes a date,
`1.234,56` follows the spreadsheet's locale. Pass `RAW` when the text must be stored
literally — a CPF, a phone number, an id with leading zeros.

**Trailing empty cells are omitted on read.** A range of 10 columns can come back as
rows of 3 values when the rest are blank. Index by position carefully, or read with
`majorDimension: "COLUMNS"` when a column is what you need.

## Setup

1. In Google Cloud Console: enable the **Google Sheets API** and the **Google Drive API**,
   then create an **OAuth client (Desktop app)**.
2. Mint a refresh token locally (opens the browser, asks for `auth/spreadsheets` + `auth/drive`):

```bash
export GSHEETS_MCP_CLIENT_ID=...
export GSHEETS_MCP_CLIENT_SECRET=...
google-sheets-mcp auth login     # prints the refresh token on stdout
```

3. Keep the token as `GSHEETS_MCP_REFRESH_TOKEN`. Revoke with `google-sheets-mcp auth logout`.

Identity depends on how the client authenticates. Over **OAuth** (claude.ai connectors) the
server acts as **the person who signed in** — their own Google refresh token travels
encrypted inside the issued token, so spreadsheets belong to them. With the static
**`MCP_AUTH_TOKEN`** (Claude Code, curl) it acts as the account behind
`GSHEETS_MCP_REFRESH_TOKEN` — the service identity, ideally a bot account.

## Environment

| Var | Required | Notes |
|-----|----------|-------|
| `GSHEETS_MCP_CLIENT_ID` | yes | falls back to `GDRIVE_MCP_CLIENT_ID` |
| `GSHEETS_MCP_CLIENT_SECRET` | yes | falls back to `GDRIVE_MCP_CLIENT_SECRET` |
| `GSHEETS_MCP_REFRESH_TOKEN` | yes | from `auth login` — store as a secret |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `HOST` / `PORT` | no | http transport only, defaults `0.0.0.0:8080` |
| `MCP_AUTH_TOKEN` | http only | ≥16 chars, **required** for http: service bearer for `/mcp` |
| `MCP_TOKEN_SIGNING_KEY` | recommended | ≥32 chars, **must differ** from `MCP_AUTH_TOKEN`: seals OAuth codes and tokens. Unset means a random key per boot |
| `MCP_OAUTH_ALLOWED_REDIRECT_HOSTS` | no | hosts allowed as OAuth redirect target (defaults to the known MCP clients) |
| `MCP_PUBLIC_URL` | http only | public origin of the deployment — used as the OAuth issuer |
| `GSHEETS_MCP_SIGNIN_CLIENT_ID` | no | Web OAuth client id — turns the OAuth consent screen into Google sign-in |
| `GSHEETS_MCP_SIGNIN_CLIENT_SECRET` | with the above | secret of that Web client |
| `GSHEETS_MCP_SIGNIN_DOMAINS` | with sign-in | email domains allowed to authorize a client, e.g. `example.com` |
| `GSHEETS_MCP_SIGNIN_SCOPES` | no | scopes asked of each user, default `spreadsheets,drive` |
| `GSHEETS_MCP_LOGIN_HINT` | no | pre-fills the Google account on `auth login` |

## Client config

Local (stdio):

```jsonc
{
  "mcpServers": {
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "@arvoretech/google-sheets-mcp"],
      "env": {
        "GSHEETS_MCP_CLIENT_ID": "...",
        "GSHEETS_MCP_CLIENT_SECRET": "...",
        "GSHEETS_MCP_REFRESH_TOKEN": "..."
      }
    }
  }
}
```

Deployed (streamable-http) — header auth:

```jsonc
{
  "mcpServers": {
    "google-sheets": {
      "url": "https://<domain>/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

claude.ai custom connectors use the built-in OAuth 2.1 flow (DCR + PKCE) — add the
connector with the plain `/mcp` URL and no Client ID. With `GSHEETS_MCP_SIGNIN_*` set, the
consent screen is Google sign-in restricted to your domains instead of a token prompt.

## Notes

- Ranges accept every A1 form: `Sheet1!A1:D50`, `'Resumo 2026'!A:B`, `Sheet1!2:10`, or a
  bare tab name for the whole tab. Tab names with spaces or an `!` must be quoted.
- `csv` export renders one tab through the Sheets API rather than Drive's export, which
  would silently give you the first tab whatever you asked for.
- `delete_sheet` refuses to remove the last remaining tab, which the API would reject anyway.
- `batch_update_spreadsheet` requests are atomic: one invalid request rejects the batch.
  Its `GridRange` indexes are zero-based and end-exclusive — row 1 on screen is index 0.
