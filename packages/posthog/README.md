# PostHog MCP Server

A Model Context Protocol (MCP) server for PostHog that provides access to analytics, feature flags, experiments, dashboards, and more. Works with both PostHog Cloud and self-hosted instances.

## Features

- **Analytics**: Run HogQL queries and structured queries (Trends, Funnels, Retention, Lifecycle, Paths, Stickiness)
- **Feature Flags**: Create, update, list, and delete feature flags with rollout control
- **Experiments**: List and inspect A/B test experiments with variants and metrics
- **Dashboards & Insights**: Create, list, and inspect dashboards and saved insights
- **Events & Properties**: Explore event definitions and property definitions
- **Persons & Cohorts**: Search users and manage segments
- **Surveys & Early Access**: List surveys and early access features
- **Annotations**: Create and list chart annotations for deployments and events
- **Search**: Search across all PostHog entities
- **Self-Hosted**: Direct API connection with static credentials — no OAuth needed
- **TypeScript**: Fully typed with Zod validation

## Installation

```bash
npm install -g @arvoretech/posthog-mcp
```

## Configuration

The server is configured via environment variables:

```bash
export POSTHOG_BASE_URL=https://posthog.example.com  # or https://app.posthog.com
export POSTHOG_API_KEY=phx_your_personal_api_key
export POSTHOG_PROJECT_ID=1                           # optional, defaults to 1
```

### Getting your API Key

1. Go to PostHog → Settings → Personal API Keys
2. Click "Create personal API key"
3. Select the scopes you need (or use the "MCP Server" preset if available)
4. Copy the generated key (starts with `phx_`)

## Usage

```bash
# Development
pnpm dev

# Production
node dist/index.js
```

## Available MCP Tools

### Feature Flags

| Tool | Description |
|------|-------------|
| `list_feature_flags` | List all feature flags with search and pagination |
| `get_feature_flag` | Get details of a specific flag by ID |
| `create_feature_flag` | Create a new flag with optional rollout percentage |
| `update_feature_flag` | Update flag key, name, or active state |
| `delete_feature_flag` | Delete a feature flag by ID |

### Experiments

| Tool | Description |
|------|-------------|
| `list_experiments` | List all A/B test experiments |
| `get_experiment` | Get experiment details including variants and metrics |

### Insights & Analytics

| Tool | Description |
|------|-------------|
| `list_insights` | List saved insights (trends, funnels, retention, etc.) |
| `get_insight` | Get a specific insight by ID |
| `create_insight` | Create a new insight and optionally add to dashboards |
| `execute_sql` | Execute a HogQL query against PostHog data |
| `execute_query` | Run structured queries (TrendsQuery, FunnelsQuery, RetentionQuery, etc.) |

### Dashboards

| Tool | Description |
|------|-------------|
| `list_dashboards` | List all dashboards with optional search |
| `get_dashboard` | Get dashboard details including its tiles |

### Events & Properties

| Tool | Description |
|------|-------------|
| `list_event_definitions` | List all tracked event types |
| `list_property_definitions` | List event or person property definitions |

### Persons & Cohorts

| Tool | Description |
|------|-------------|
| `list_persons` | Search users by email, name, or distinct ID |
| `list_cohorts` | List all cohorts (user segments) |

### Annotations

| Tool | Description |
|------|-------------|
| `list_annotations` | List all chart annotations |
| `create_annotation` | Create a new annotation marker |

### Surveys & Early Access

| Tool | Description |
|------|-------------|
| `list_surveys` | List all surveys |
| `list_early_access_features` | List early access features |

### Organization & Search

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects for the current API key |
| `search` | Search across all PostHog entities |

## HogQL Examples

Daily event counts for the last 7 days:

```sql
SELECT toDate(timestamp) as day, count() as events
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY day ORDER BY day
```

Unique users by browser:

```sql
SELECT properties.$browser as browser, uniq(distinct_id) as users
FROM events
WHERE event = 'pageview' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY browser ORDER BY users DESC
```

Daily active users:

```sql
SELECT toDate(timestamp) as day, uniq(distinct_id) as dau
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day
```

## Programmatic Usage

```typescript
import { PostHogMCPServer } from "@arvoretech/posthog-mcp";

const server = new PostHogMCPServer({
  baseUrl: "https://posthog.example.com",
  apiKey: "phx_your_key",
  projectId: "1",
});

server.setupGracefulShutdown();
await server.start();
```

## Claude Desktop / Kiro Integration

```json
{
  "mcpServers": {
    "posthog": {
      "command": "npx",
      "args": ["-y", "@arvoretech/posthog-mcp"],
      "env": {
        "POSTHOG_BASE_URL": "https://posthog.example.com",
        "POSTHOG_API_KEY": "phx_your_personal_api_key"
      }
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## Limitations

- Stdio transport only (no HTTP/WebSocket)
- HogQL queries are read-only by design (PostHog API restriction)
- Requires a Personal API Key (`phx_` prefix), not a project API key
