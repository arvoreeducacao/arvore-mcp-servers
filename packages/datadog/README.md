# Datadog MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with access to Datadog monitoring and observability data.

## Features

- **Metrics Querying**: Query time series metrics data
- **Log Search**: Search and retrieve logs with advanced filtering
- **Dashboard Management**: List and access dashboard information
- **Monitor Management**: Retrieve monitor configurations and status
- **Service Maps**: Access APM service topology data
- **Infrastructure Monitoring**: List and filter hosts
- **Active Metrics**: Discover currently reporting metrics
- **APM Tracing**: Search traces, list services, and get spans metrics
- **Distributed Tracing**: Analyze application performance and dependencies

## Installation

```bash
pnpm install
pnpm build
```

## Configuration

Set the required environment variables:

```bash
export DATADOG_API_KEY="your-datadog-api-key"
export DATADOG_APP_KEY="your-datadog-application-key"
export DATADOG_SITE="datadoghq.com"  # Optional, defaults to datadoghq.com
```

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Required
DATADOG_API_KEY=your-datadog-api-key-here
DATADOG_APP_KEY=your-datadog-application-key-here

# Optional (defaults to datadoghq.com)
DATADOG_SITE=datadoghq.com

# Other available sites:
# EU: datadoghq.eu
# US3: us3.datadoghq.com  
# US5: us5.datadoghq.com
# Government: ddog-gov.com
```

### Getting API Keys

1. Go to [Datadog API Keys](https://app.datadoghq.com/organization-settings/api-keys)
2. Create or copy your API key
3. Go to [Datadog Application Keys](https://app.datadoghq.com/organization-settings/application-keys)
4. Create or copy your Application key

## Usage

### Direct Execution

```bash
node dist/index.js
```

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "node",
      "args": ["/path/to/datadog-mcp-server/dist/index.js"],
      "env": {
        "DATADOG_API_KEY": "your-api-key",
        "DATADOG_APP_KEY": "your-app-key",
        "DATADOG_SITE": "datadoghq.com"
      }
    }
  }
}
```

## Available Tools

### query_metrics
Query Datadog metrics with time series data.

**Parameters:**
- `query` (string): Datadog metrics query (e.g., 'avg:system.cpu.user{*}')
- `from` (number): Start timestamp (Unix epoch in seconds)
- `to` (number): End timestamp (Unix epoch in seconds)

### search_logs
Search and retrieve logs from Datadog.

**Parameters:**
- `query` (string): Log search query using Datadog search syntax
- `time` (object): Time range with `from` and `to` ISO strings
- `limit` (number): Maximum number of logs (1-1000, default 50)

### list_dashboards
Retrieve a list of dashboards from your account.

**Parameters:**
- `count` (number): Number of dashboards (max 100, default 25)
- `start` (number): Starting index for pagination (default 0)

### list_monitors
Retrieve monitors from your account.

**Parameters:**
- `groupStates` (array): Filter by monitor group states
- `name` (string): Filter by monitor name
- `tags` (array): Filter by tags
- `monitorTags` (array): Filter by monitor tags
- `withDowntimes` (boolean): Include downtime info (default true)

### get_service_map
Retrieve APM service map data.

**Parameters:**
- `env` (string): Environment name (e.g., 'production')
- `start` (number): Start timestamp (Unix epoch in seconds)
- `end` (number): End timestamp (Unix epoch in seconds)

### list_hosts
List infrastructure hosts.

**Parameters:**
- `filter` (string): Filter hosts by name or tag
- `sortField` (string): Sort field ('status', 'name', 'checkTime', 'triggerTime')
- `sortDir` (string): Sort direction ('asc', 'desc')
- `start` (number): Starting index (default 0)
- `count` (number): Number of hosts (max 1000, default 100)

### get_active_metrics
Get currently reporting metrics from the last hour.

**Parameters:** None

### search_traces
Search for traces in Datadog APM with filtering capabilities.

**Parameters:**
- `query` (string): Trace search query (default "*")
- `start` (number): Start timestamp (Unix epoch in seconds)
- `end` (number): End timestamp (Unix epoch in seconds)
- `limit` (number): Maximum number of traces (1-1000, default 50)

### list_services
List services monitored by Datadog APM.

**Parameters:**
- `start` (number): Start timestamp (Unix epoch in seconds)
- `end` (number): End timestamp (Unix epoch in seconds)
- `env` (string): Environment filter (optional)

### get_spans_metrics
Get metrics for spans with optional filtering.

**Parameters:**
- `start` (number): Start timestamp (Unix epoch in seconds)
- `end` (number): End timestamp (Unix epoch in seconds)
- `service` (string): Service name filter (optional)
- `operation` (string): Operation name filter (optional)
- `resource` (string): Resource name filter (optional)
- `env` (string): Environment filter (optional)

## Example Queries

### Query CPU Usage
```json
{
  "query": "avg:system.cpu.user{*}",
  "from": 1640995200,
  "to": 1641081600
}
```

### Search Error Logs
```json
{
  "query": "status:error service:web-app",
  "time": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-01T23:59:59Z"
  },
  "limit": 100
}
```

### Search Traces with Errors
```json
{
  "query": "service:web-app error:true",
  "start": 1640995200,
  "end": 1641081600,
  "limit": 50
}
```

### List Services in Production
```json
{
  "start": 1640995200,
  "end": 1641081600,
  "env": "production"
}
```

### Get Spans Metrics for Specific Service
```json
{
  "start": 1640995200,
  "end": 1641081600,
  "service": "web-api",
  "env": "production"
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode
pnpm dev

# Lint code
pnpm lint

# Run tests with coverage
pnpm test:cov
```

## License

MIT
