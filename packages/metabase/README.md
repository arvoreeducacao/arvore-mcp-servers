# Metabase MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with access to Metabase analytics — query data, manage cards (reports), dashboards, and collections.

## Features

- **Cards (Questions/Reports)**: List, create, update, delete, and run card queries
- **Dashboards**: List, create, delete dashboards and add cards to them
- **Collections**: List and create collections to organize content
- **Databases**: List connected databases and their tables
- **SQL Queries**: Execute native SQL queries against any connected database

## Installation

```bash
npm install -g @arvoretech/metabase-mcp
```

## Configuration

Set the required environment variables:

```bash
export METABASE_URL="https://your-metabase-instance.com"
export METABASE_API_KEY="your-metabase-api-key"
```

### Getting an API Key

1. Go to your Metabase instance
2. Navigate to **Admin** > **Settings** > **Authentication** > **API Keys**
3. Create a new API key with the appropriate permissions

## Usage

### Direct Execution

```bash
node dist/index.js
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "metabase": {
      "command": "npx",
      "args": ["-y", "@arvoretech/metabase-mcp"],
      "env": {
        "METABASE_URL": "https://your-metabase-instance.com",
        "METABASE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

### list_cards
List all cards (questions/reports). Filter by: all, mine, bookmarked, archived, recent, popular.

### get_card
Get full details of a specific card by ID.

### create_card
Create a new card with a query definition and visualization type (table, bar, line, pie, etc).

### update_card
Update a card's name, description, display type, or visualization settings.

### delete_card
Delete a card by ID.

### run_card_query
Execute a saved card's query and return the results (limited to 100 rows).

### list_dashboards
List all dashboards.

### get_dashboard
Get dashboard details including its cards and layout.

### create_dashboard
Create a new empty dashboard.

### add_card_to_dashboard
Add an existing card to a dashboard at a specific grid position (row, col, size).

### delete_dashboard
Delete a dashboard by ID.

### list_collections
List all collections (folders).

### create_collection
Create a new collection to organize cards and dashboards.

### list_databases
List all databases connected to Metabase.

### run_query
Execute a native SQL query against a specific database (limited to 200 rows).

### list_tables
List all tables in a specific database.

## Development

```bash
pnpm install
pnpm build
pnpm dev
pnpm lint
pnpm test:cov
```

## License

MIT
