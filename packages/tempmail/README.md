# TempMail MCP Server

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tempmail-mcp&registry=https://npm.pkg.github.com&packageName=@arvoretech/tempmail-mcp)

A Model Context Protocol (MCP) server for temporary/disposable email management, powered by **Cloudflare D1** (edge SQLite) and **Email Workers**. Zero infrastructure to manage — everything runs on Cloudflare.

## Features

- 📧 **Create Accounts**: Generate temporary email addresses on your domain
- 📬 **Read Emails**: Full access to email content (text + HTML)
- 🗑️ **Manage**: Delete accounts and messages
- ☁️ **Cloudflare D1**: Serverless SQLite storage on the edge
- 📮 **Email Workers**: Cloudflare handles MX, SMTP, and email routing
- 📡 **MCP Protocol**: Communication via stdio transport
- 🛠️ **TypeScript**: Fully typed with Zod validation

## Architecture

```
Gmail / any sender
  → Cloudflare MX (your domain)
    → Email Worker (parses + stores in D1)

MCP Server (local, Cursor/Claude)
  → Cloudflare D1 REST API (reads/writes accounts & messages)
```

- **`D1DatabaseClient`**: Cloudflare D1 REST API client for all database operations
- **`TempMailMCPTools`**: MCP tool implementations for account/message management
- **`TempMailMCPServer`**: Main MCP server with stdio transport

## Setup

### 1. Create a D1 Database

In the Cloudflare Dashboard → **Workers & Pages** → **D1** → **Create database**.

Or via Wrangler CLI:

```bash
npx wrangler d1 create tempmail
```

Save the `database_id` from the output.

### 2. Run the Schema Migration

In the Cloudflare Dashboard → D1 → your database → **Console**, run:

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  domain TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  from_address TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL DEFAULT '',
  raw TEXT NOT NULL DEFAULT '',
  has_attachments INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address);
```

### 3. Enable Email Routing

In Cloudflare Dashboard → your domain → **Email** → **Email Routing** → Enable. Cloudflare will automatically configure the MX records.

### 4. Create the Email Worker

Go to **Email Routing** → **Email Workers** → create a new worker with this code:

```javascript
function extractBody(raw) {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) return { text: "", html: "" };

  const headers = raw.substring(0, headerEnd);
  const ctMatch = headers.match(/^Content-Type:\s*([^\r\n]+(?:\r\n\s+[^\r\n]+)*)/im);
  if (!ctMatch) return { text: raw.substring(headerEnd + 4).trim(), html: "" };

  const contentType = ctMatch[1].replace(/\r\n\s+/g, " ");

  if (contentType.includes("text/plain")) {
    return { text: raw.substring(headerEnd + 4).trim(), html: "" };
  }

  if (contentType.includes("text/html")) {
    return { text: "", html: raw.substring(headerEnd + 4).trim() };
  }

  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
  if (!boundaryMatch) return { text: "", html: "" };

  const boundary = boundaryMatch[1];
  const parts = raw.split("--" + boundary);
  let text = "";
  let html = "";

  for (const part of parts) {
    const partHeaderEnd = part.indexOf("\r\n\r\n");
    if (partHeaderEnd === -1) continue;

    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4).replace(/--\s*$/, "").trim();

    if (partHeaders.match(/Content-Type:\s*text\/plain/i) && !text) {
      text = partBody;
    }
    if (partHeaders.match(/Content-Type:\s*text\/html/i) && !html) {
      html = partBody;
    }
  }

  return { text, html };
}

export default {
  async email(message, env, ctx) {
    const to = message.to.toLowerCase();

    const account = await env.D1.prepare(
      "SELECT id FROM accounts WHERE address = ? AND is_active = 1"
    ).bind(to).first();

    if (!account) {
      message.setReject("Mailbox not found");
      return;
    }

    const rawEmail = new Response(message.raw);
    const raw = await rawEmail.text();

    const subject = message.headers.get("subject") || "(no subject)";
    const fromHeader = message.headers.get("from") || message.from;

    let fromName = "";
    const nameMatch = fromHeader.match(/^"?([^"<]*)"?\s*<?/);
    if (nameMatch && nameMatch[1]) {
      fromName = nameMatch[1].trim();
    }

    const { text, html } = extractBody(raw);
    const id = crypto.randomUUID();

    await env.D1.prepare(
      "INSERT INTO messages (id, account_id, from_address, from_name, to_address, subject, text, html, raw, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id,
      account.id,
      message.from,
      fromName,
      to,
      subject,
      text,
      html,
      raw,
      message.rawSize
    ).run();
  }
}
```

### 5. Bind D1 to the Worker

In the Worker settings → **Bindings** → add a **D1 Database** binding:
- Variable name: `D1`
- Database: select your tempmail database

### 6. Create a Catch-All Routing Rule

In **Email Routing** → **Routing rules** → enable **Catch-all** → route to your Email Worker.

### 7. Create a Cloudflare API Token

Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token**:
- **Permissions**: Account → D1 → Edit
- **Account Resources**: your account

Save the token.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | Yes | D1 database ID |
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with D1 permissions |
| `TEMPMAIL_DOMAIN` | No | Email domain (default: `tempmail.arvore.com.br`) |

### Cursor MCP Configuration

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "tempmail": {
      "command": "npx",
      "args": ["-y", "@arvoretech/tempmail-mcp"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "your-account-id",
        "CLOUDFLARE_D1_DATABASE_ID": "your-database-id",
        "CLOUDFLARE_API_TOKEN": "your-api-token",
        "TEMPMAIL_DOMAIN": "yourdomain.com"
      }
    }
  }
}
```

## Available MCP Tools

### `get_domains`

Get the list of available email domains.

### `create_email_account`

Create a new temporary email account.

**Parameters:**
- `username` (string): Username for the email (e.g. "testuser" → testuser@domain.com)

### `list_email_accounts`

List all active temporary email accounts.

**Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)

### `delete_email_account`

Delete a temporary email account and all its messages.

**Parameters:**
- `accountId` (string): The account ID to delete

### `get_inbox`

List messages received by an email account.

**Parameters:**
- `accountId` (string): The account ID
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20, max: 100)

### `read_email`

Read the full content of an email message.

**Parameters:**
- `messageId` (string): The message ID

### `delete_email`

Delete a specific email message.

**Parameters:**
- `messageId` (string): The message ID to delete

## Web UI

The package includes a built-in web interface (Gmail-like) for browsing emails in the browser.

### Using the published package

```bash
npx @arvoretech/tempmail-mcp ui
```

Make sure the required environment variables are set, or create a `.env` file in the current directory:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-database-id
CLOUDFLARE_API_TOKEN=your-api-token
TEMPMAIL_DOMAIN=yourdomain.com
```

### Options

```bash
npx @arvoretech/tempmail-mcp ui                  # default port 3847, auto-opens browser
npx @arvoretech/tempmail-mcp ui --port 8080       # custom port
npx @arvoretech/tempmail-mcp ui --no-open         # don't auto-open browser
```

### Programmatic usage

```typescript
import { WebUIServer } from "@arvoretech/tempmail-mcp";

const ui = new WebUIServer({ port: 3847, open: true });
await ui.start();
```

## Development

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
pnpm dev:ui    # run web UI in dev mode (tsx)
```

## License

MIT
