# Arvore MCP Servers

A collection of Model Context Protocol (MCP) servers developed by Arvore for seamless integration with AI assistants like Claude.

[![CI](https://github.com/arvore-education/mcp-servers/actions/workflows/ci.yml/badge.svg)](https://github.com/arvore-education/mcp-servers/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 📦 Packages

This monorepo contains the following MCP servers:

### [@arvore/aws-secrets-manager-mcp](./packages/aws-secrets-manager)

Manage AWS Secrets Manager secrets directly from your AI assistant.

**Features:**

- Create, read, update, and delete secrets
- List all secrets in your account
- Describe secret metadata

### [@arvore/datadog-mcp](./packages/datadog)

Query and analyze Datadog monitoring data.

**Features:**

- Query metrics and time series data
- Search logs
- Get service maps and APM data
- List hosts and active metrics
- Search traces

### [@arvore/mysql-mcp](./packages/mysql)

Execute read-only MySQL queries safely.

**Features:**

- Execute SELECT queries
- List tables in database
- Read-only operations for safety

### [@arvore/npm-registry-mcp](./packages/npm-registry)

Search and get information about npm packages.

**Features:**

- Get package information and metadata
- Get download statistics
- Search packages by query

## 🚀 Quick Start

### Installation

Install individual packages:

```bash
npm install -g @arvore/aws-secrets-manager-mcp
npm install -g @arvore/datadog-mcp
npm install -g @arvore/mysql-mcp
npm install -g @arvore/npm-registry-mcp
```

Or using pnpm:

```bash
pnpm add -g @arvore/aws-secrets-manager-mcp
```

### Configuration

Add to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "aws-secrets-manager": {
      "command": "aws-secrets-manager-mcp"
    },
    "datadog": {
      "command": "datadog-mcp",
      "env": {
        "DATADOG_API_KEY": "your-api-key",
        "DATADOG_APP_KEY": "your-app-key",
        "DATADOG_SITE": "datadoghq.com"
      }
    },
    "mysql": {
      "command": "mysql-mcp",
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "password",
        "MYSQL_DATABASE": "your_database"
      }
    },
    "npm-registry": {
      "command": "npm-registry-mcp"
    }
  }
}
```

## 🛠️ Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Setup

```bash
git clone https://github.com/arvore-education/mcp-servers.git
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

Packages are automatically published to npm when:

- A commit is pushed to the `main` branch (all packages)
- A version tag is created (specific package)

Manual publishing:

```bash
pnpm -r publish --access public
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
