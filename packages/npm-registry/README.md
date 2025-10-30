# NPM Registry MCP Server

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=npm-registry-mcp&registry=https://npm.pkg.github.com&packageName=@arvoretech/npm-registry-mcp)

A Model Context Protocol (MCP) server implementation that provides comprehensive access to NPM package information through the official NPM registry API. Perfect for integrating NPM package data with LLMs and AI tools.

## Features

- 📦 **Package Information**: Complete metadata, dependencies, and version history
- 📊 **Download Statistics**: Weekly download counts and trends
- 🔍 **Package Search**: Advanced search with scoring and filtering
- 🚀 **Fast**: Direct API calls to NPM registry using fetch
- 📡 **MCP Protocol**: Communication via stdio transport
- 🛠️ **TypeScript**: Fully typed with Zod validation
- 🌐 **No Configuration**: Uses public NPM APIs - no setup required

## Installation

```bash
npm install -g @arvoretech/npm-registry-mcp --registry=https://npm.pkg.github.com
```

Or configure your `.npmrc`:

```bash
echo "@arvoretech:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm install -g @arvoretech/npm-registry-mcp
```

## Usage

```bash
# Development
pnpm dev

# Production
node dist/index.js
```

## Available MCP Tools

### `get_package_info`

Retrieves comprehensive information about an NPM package.

**Parameters:**

- `packageName` (string): Name of the NPM package

**Returns:**

- Package metadata (name, version, description)
- Author and maintainer information
- Dependencies and dev dependencies
- Repository and homepage links
- Available versions and distribution tags
- Creation and modification timestamps

**Example:**

```json
{
  "packageName": "react"
}
```

### `get_package_downloads`

Gets download statistics for an NPM package from the last week.

**Parameters:**

- `packageName` (string): Name of the NPM package

**Returns:**

- Total downloads in the last week
- Average downloads per day
- Date range for the statistics

**Example:**

```json
{
  "packageName": "typescript"
}
```

### `search_packages`

Searches for NPM packages with advanced filtering and scoring.

**Parameters:**

- `query` (string): Search query string
- `size` (number, optional): Number of results to return (1-250, default: 20)

**Returns:**

- Search results with package metadata
- Quality, popularity, and maintenance scores
- Author and keyword information
- Repository and homepage links

**Example:**

```json
{
  "query": "react component",
  "size": 10
}
```

## Programmatic Usage

```typescript
import { NPMMCPServer } from "npm-mcp-server";

const server = new NPMMCPServer();

// Setup graceful shutdown
server.setupGracefulShutdown();

// Start server
await server.start();
```

## Claude Desktop Integration

Add to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "npm-registry": {
      "command": "npx",
      "args": ["-y", "@arvoretech/npm-registry-mcp"]
    }
  }
}
```

## API Endpoints

The server integrates with these NPM API endpoints:

- **Package Info**: `https://registry.npmjs.org/<package>`
- **Download Stats**: `https://api.npmjs.org/downloads/point/last-week/<package>`
- **Search**: `https://registry.npmjs.org/-/v1/search?text=<query>&size=<size>`

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Linting
pnpm lint
pnpm lint:fix
```

## Architecture

- **`NPMClient`**: Handles NPM API communication and error handling
- **`NPMMCPTools`**: Implements MCP tool logic and response formatting
- **`NPMMCPServer`**: Main MCP server with stdio transport
- **Validation**: Uses Zod for type and parameter validation
- **Error Handling**: Comprehensive error handling for API failures

## Error Handling

- **Network errors**: Graceful handling of API timeouts and connectivity issues
- **Package not found**: Clear error messages for non-existent packages
- **Rate limiting**: Appropriate handling of NPM API rate limits
- **Validation**: Input validation with descriptive error messages

## Limitations

- Read-only access to NPM registry (no publishing capabilities)
- Uses public NPM APIs only
- Weekly download statistics only (NPM API limitation)
- Stdio transport only (no HTTP/WebSocket)
- No caching (each request hits NPM API)

## License

MIT
