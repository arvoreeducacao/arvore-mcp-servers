# @arvoretech/sendgrid-mcp

MCP Server for managing SendGrid Dynamic Templates.

## Tools

| Tool | Description |
|------|-------------|
| `list_templates` | List all dynamic templates |
| `get_template` | Get a template by ID (with versions) |
| `create_template` | Create a new dynamic template |
| `update_template` | Update a template's name |
| `delete_template` | Delete a template |
| `create_version` | Create a new version for a template |
| `get_version` | Get a specific version |
| `update_version` | Update version content (HTML, subject, etc.) |
| `delete_version` | Delete a version |
| `activate_version` | Activate a version |

## Getting a SendGrid API Key

1. Go to [https://app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys)
2. Click "Create API Key"
3. Give it a name (e.g. "MCP Server")
4. Under permissions, select "Restricted Access" and enable:
   - **Template Engine** → Full Access
5. Click "Create & View"
6. Copy the key (starts with `SG.`) — it's only shown once

## Configuration

Set the `SENDGRID_API_KEY` environment variable.

```json
{
  "mcpServers": {
    "sendgrid": {
      "command": "npx",
      "args": ["-y", "@arvoretech/sendgrid-mcp"],
      "env": {
        "SENDGRID_API_KEY": "${SENDGRID_API_KEY}"
      },
      "autoApprove": ["*"]
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev      # run with tsx
pnpm build    # compile
pnpm start    # run compiled
```
