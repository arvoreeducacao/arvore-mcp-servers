# HubSpot MCP Server

MCP server for the HubSpot CRM. Exposes contacts, companies, deals, tickets, activities (notes, tasks, calls, emails, meetings), associations, CRM metadata (pipelines and properties) and conversations (inbox).

## Authentication

Uses a **Private App access token**. Create a Private App in HubSpot (Settings → Integrations → Private Apps), grant the required scopes, and copy the token.

```bash
export HUBSPOT_ACCESS_TOKEN="pat-na1-xxxxxxxx"
```

Suggested scopes: `crm.objects.contacts.*`, `crm.objects.companies.*`, `crm.objects.deals.*`, `tickets`, `crm.schemas.*`, `conversations.read`, `conversations.write`.

## Read-only mode

By default the server runs in **read-only mode** — only the 11 read tools are registered, write tools are not exposed. To enable the 7 write tools, set:

```bash
export HUBSPOT_READ_ONLY=false
```

Any value other than the literal string `false` (or unset) keeps read-only mode on.

## Tools

### CRM objects (generic by `objectType`)

`objectType` accepts standard objects (`contacts`, `companies`, `deals`, `tickets`), activities (`notes`, `tasks`, `calls`, `emails`, `meetings`) or a custom `objectTypeId` (e.g. `2-12345`).

> Write tools (marked ✏️) are only registered when `HUBSPOT_READ_ONLY=false`.

| Tool | Description |
|------|-------------|
| `list_objects` | List records of an object type with pagination |
| `get_object` | Get a record by ID or unique `idProperty` |
| `search_objects` | Search with `filterGroups`, free-text `query`, sorting and pagination |
| `batch_read_objects` | Read up to 100 records in one request |
| ✏️ `create_object` | Create a record with properties and optional associations |
| ✏️ `update_object` | Update a record's properties |
| ✏️ `delete_object` | Archive (soft-delete) a record |

### Associations (v4)

| Tool | Description |
|------|-------------|
| `list_associations` | List associated records of a target type for a source record |
| ✏️ `create_association` | Default (unlabeled) or labeled association between two records |
| ✏️ `delete_association` | Remove all associations between two records |

### Metadata

| Tool | Description |
|------|-------------|
| `list_pipelines` | Pipelines and stages for an object type (deals, tickets) |
| `list_properties` | Property definitions for an object type |

### Conversations (inbox)

| Tool | Description |
|------|-------------|
| `list_inboxes` | List conversation inboxes |
| `list_threads` | List threads, optionally filtered by inbox/status |
| `get_thread` | Get a thread by ID |
| `list_thread_messages` | Message history of a thread |
| ✏️ `send_thread_message` | Send an outbound message through an existing channel |
| ✏️ `update_thread` | Update thread status (OPEN/CLOSED) or archived flag |

## Usage examples

Search contacts by email:

```json
{
  "tool": "search_objects",
  "args": {
    "objectType": "contacts",
    "filterGroups": [
      { "filters": [{ "propertyName": "email", "operator": "EQ", "value": "jane@acme.com" }] }
    ],
    "properties": ["email", "firstname", "lastname"]
  }
}
```

Create a deal associated with a contact:

```json
{
  "tool": "create_object",
  "args": {
    "objectType": "deals",
    "properties": { "dealname": "Acme - Enterprise", "pipeline": "default", "dealstage": "appointmentscheduled" },
    "associations": [{ "toObjectId": "501", "associationTypeId": 3 }]
  }
}
```

Log a note on a contact:

```json
{
  "tool": "create_object",
  "args": {
    "objectType": "notes",
    "properties": { "hs_note_body": "Spoke with the client today.", "hs_timestamp": "2026-06-10T12:00:00Z" },
    "associations": [{ "toObjectId": "501", "associationTypeId": 202 }]
  }
}
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm dev
```

## Run

```bash
HUBSPOT_ACCESS_TOKEN="pat-na1-xxxx" node dist/index.js
```

MCP client config:

```json
{
  "mcpServers": {
    "hubspot": {
      "command": "npx",
      "args": ["-y", "@arvoretech/hubspot-mcp"],
      "env": { "HUBSPOT_ACCESS_TOKEN": "pat-na1-xxxx" }
    }
  }
}
```
