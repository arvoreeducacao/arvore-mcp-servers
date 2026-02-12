# Arvore MCP Servers

A collection of Model Context Protocol (MCP) servers developed by Arvore for seamless integration with AI assistants like Claude.

[![CI](https://github.com/arvoreeducacao/arvore-mcp-servers/actions/workflows/ci.yml/badge.svg)](https://github.com/arvoreeducacao/arvore-mcp-servers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📦 Packages

This monorepo contains the following MCP servers:

### [@arvoretech/aws-secrets-manager-mcp](./packages/aws-secrets-manager)

Manage AWS Secrets Manager secrets directly from your AI assistant.

**Features:**

- Create, read, update, and delete secrets
- List all secrets in your account
- Describe secret metadata

### [@arvoretech/datadog-mcp](./packages/datadog)

Query and analyze Datadog monitoring data.

**Features:**

- Query metrics and time series data
- Search logs
- Get service maps and APM data
- List hosts and active metrics
- Search traces

### [@arvoretech/mysql-mcp](./packages/mysql)

Execute read-only MySQL queries safely.

**Features:**

- Execute SELECT queries
- List tables in database
- Read-only operations for safety

### [@arvoretech/postgresql-mcp](./packages/postgresql)

Execute read-only PostgreSQL queries safely.

**Features:**

- Execute SELECT queries
- List tables, schemas, and databases
- Describe table structure
- Full schema support
- Read-only operations for safety

### [@arvoretech/npm-registry-mcp](./packages/npm-registry)

Search and get information about npm packages.

**Features:**

- Get package information and metadata
- Get download statistics
- Search packages by query

### [@arvoretech/tempmail-mcp](./packages/tempmail)

Self-hosted temporary email server with SMTP + SQLite.

**Features:**

- Built-in SMTP server to receive real emails
- Create and manage temporary email accounts
- Read, list, and delete emails
- SQLite storage — no third-party dependencies
- Configurable domain via AWS Route 53

## 🚀 Quick Start

### Installation

Install individual packages:

```bash
npm install -g @arvoretech/aws-secrets-manager-mcp
npm install -g @arvoretech/datadog-mcp
npm install -g @arvoretech/mysql-mcp
npm install -g @arvoretech/postgresql-mcp
npm install -g @arvoretech/npm-registry-mcp
npm install -g @arvoretech/tempmail-mcp
```

Or using pnpm:

```bash
pnpm add -g @arvoretech/aws-secrets-manager-mcp
```

### Configuration

Add to your Claude Desktop configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "aws-secrets-manager": {
      "command": "npx",
      "args": ["-y", "@arvoretech/aws-secrets-manager-mcp"]
    },
    "datadog": {
      "command": "npx",
      "args": ["-y", "@arvoretech/datadog-mcp"],
      "env": {
        "DATADOG_API_KEY": "your-api-key",
        "DATADOG_APP_KEY": "your-app-key",
        "DATADOG_SITE": "datadoghq.com"
      }
    },
    "mysql": {
      "command": "npx",
      "args": ["-y", "@arvoretech/mysql-mcp"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "password",
        "MYSQL_DATABASE": "your_database",
        "MYSQL_PORT": "3306"
      }
    },
    "postgresql": {
      "command": "npx",
      "args": ["-y", "@arvoretech/postgresql-mcp"],
      "env": {
        "POSTGRESQL_HOST": "localhost",
        "POSTGRESQL_PORT": "5432",
        "POSTGRESQL_USER": "postgres",
        "POSTGRESQL_PASSWORD": "password",
        "POSTGRESQL_DATABASE": "your_database",
        "POSTGRESQL_SSL": "false"
      }
    },
    "npm-registry": {
      "command": "npx",
      "args": ["-y", "@arvoretech/npm-registry-mcp"]
    },
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

**Note:** These packages are published to the public npm registry and can be used directly with `npx` without any additional configuration.

## 🛠️ Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
git clone https://github.com/arvoreeducacao/arvore-mcp-servers.git
cd mcp-servers
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Run tests with coverage

```bash
pnpm test:cov
```

### Lint

```bash
pnpm lint
```

### Development mode

Run a specific package in development mode:

```bash
cd packages/aws-secrets-manager
pnpm dev
```

## 📝 Adding a New Package

1. Create a new directory in `packages/`
2. Follow the structure of existing packages
3. Update the root `README.md`
4. Add package-specific documentation

## 🚢 Publishing

### Automatic Publishing

This monorepo uses GitHub Actions for automatic publishing to npm. Publishing happens in these scenarios:

#### 1. Push to main branch

All packages are automatically published when code is merged to main (after CI passes).

#### 2. Manual workflow dispatch

You can manually trigger publishing for a specific package:

- Go to GitHub Actions
- Select "Publish Packages" workflow
- Click "Run workflow"
- Specify package name (e.g., `@arvoretech/aws-secrets-manager-mcp`)
- Choose version bump type (`major`, `minor`, or `patch`)

### Setup Requirements

To enable automatic publishing, add these secrets to your GitHub repository:

1. **NPM_TOKEN**: Required for publishing to npm
   - Create a token at https://www.npmjs.com/settings/tokens
   - Select "Automation" token type
   - Add as repository secret in GitHub Settings > Secrets and variables > Actions

2. **CODECOV_TOKEN** (optional): For coverage reports
   - Get from https://codecov.io
   - Add as repository secret

### Manual Publishing

If needed, you can publish manually (requires authentication):

```bash
# Publish all packages
pnpm -r publish

# Publish specific package
cd packages/aws-secrets-manager
npm publish
```

### Version Management

To bump versions:

```bash
# In a specific package directory
cd packages/aws-secrets-manager
pnpm version patch  # or minor, major
```

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Anthropic Claude](https://www.anthropic.com/claude)
- [Arvore Education](https://www.arvore.com)

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Made with ❤️ by [Arvore Education](https://www.arvore.com)
