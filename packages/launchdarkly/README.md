# LaunchDarkly MCP Server

A Model Context Protocol (MCP) server for managing LaunchDarkly feature flags. Uses session-based authentication (email/password) with direct API calls — no external dependencies beyond the MCP SDK.

## Features

- **Feature Flags**: List, search, create, delete, toggle ON/OFF
- **Targeting Rules**: Add rules with clauses (in, contains, segmentMatch, etc.)
- **Segments**: List and inspect segments
- **Multi-environment**: Operate on any environment (production, test, etc.)
- **Semantic Patch**: Full support for LaunchDarkly's semantic patch API
- **Auto re-auth**: Automatically re-authenticates if session expires

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAUNCHDARKLY_EMAIL` | Yes | — | Account email |
| `LAUNCHDARKLY_PASSWORD` | Yes | — | Account password |
| `LAUNCHDARKLY_BASE_URL` | No | `https://app.launchdarkly.com` | LaunchDarkly base URL |
| `LAUNCHDARKLY_PROJECT` | No | `default` | Default project key |
| `LAUNCHDARKLY_ENVIRONMENT` | No | `production` | Default environment key |

## Cursor IDE Integration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "launchdarkly": {
      "command": "node",
      "args": ["packages/launchdarkly/dist/index.js"],
      "env": {
        "LAUNCHDARKLY_EMAIL": "your-email@example.com",
        "LAUNCHDARKLY_PASSWORD": "your-password",
        "LAUNCHDARKLY_PROJECT": "default",
        "LAUNCHDARKLY_ENVIRONMENT": "production"
      }
    }
  }
}
```

## Available MCP Tools

### Flags

| Tool | Description |
|------|-------------|
| `list_flags` | List flags with pagination, filtering, and sorting |
| `get_flag` | Get detailed flag info (variations, rules, targeting) |
| `search_flags` | Search flags by name or key |
| `create_flag` | Create a new boolean feature flag |
| `delete_flag` | Permanently delete a flag |
| `toggle_flag` | Turn a flag ON or OFF in a specific environment |
| `get_flag_statuses` | Get evaluation status of specific flags |

### Targeting

| Tool | Description |
|------|-------------|
| `add_flag_rule` | Add a targeting rule with clauses and variation |
| `update_flag_targeting` | Send raw semantic patch instructions (advanced) |

### Segments

| Tool | Description |
|------|-------------|
| `list_segments` | List segments in a project/environment |
| `get_segment` | Get segment details including rules |

### Project

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `list_environments` | List environments in a project |

## Targeting Rule Operators

The `add_flag_rule` tool supports these clause operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `in` | Exact match | `access_token in ["TOKEN1", "TOKEN2"]` |
| `contains` | String contains | `email contains "@company.com"` |
| `startsWith` | String starts with | `name startsWith "admin"` |
| `endsWith` | String ends with | `domain endsWith ".edu"` |
| `matches` | Regex match | `key matches "^test-.*"` |
| `lessThan` | Numeric less than | `age lessThan 18` |
| `greaterThanOrEqual` | Numeric gte | `score greaterThanOrEqual 100` |
| `segmentMatch` | In segment | `Context in segment "beta-users"` |

## Development

```bash
pnpm install
pnpm dev       # Run with tsx
pnpm build     # Compile TypeScript
pnpm lint      # Run ESLint
pnpm test      # Run tests
```

## Architecture

- **`LaunchDarklyClient`**: Handles login (2-step cookie auth) and API requests
- **`LaunchDarklyMCPTools`**: Tool implementations and response formatting
- **`LaunchDarklyMCPServer`**: MCP server with stdio transport and tool registration
- **Validation**: Zod schemas for all inputs
- **Auth**: Cookie-based session via `/internal/account/login` + `/internal/account/login2`

## Authentication Flow

1. `POST /internal/account/login` with email + password
2. `PUT /internal/account/login2` with email
3. Session cookies (`ldso`, `pa_ldso`, `ob_ldso`) captured and reused
4. On 401, automatically re-authenticates

## License

MIT
