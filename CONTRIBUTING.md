# Contributing to Arvore MCP Servers

Thank you for your interest in contributing! This document provides guidelines for contributing to this monorepo.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-servers.git
   cd mcp-servers
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:cov

# Run tests for a specific package
cd packages/aws-secrets-manager
pnpm test
```

### Linting

```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix
```

### Building

```bash
# Build all packages
pnpm build

# Build a specific package
cd packages/aws-secrets-manager
pnpm build
```

## Creating a New MCP Server Package

1. Create a new directory in `packages/`:

   ```bash
   mkdir packages/your-mcp-name
   ```

2. Create a `package.json` following the structure of existing packages:

   ```json
   {
     "name": "@arvore/your-mcp-name",
     "version": "1.0.0",
     "description": "Description of your MCP server",
     "main": "dist/index.js",
     "type": "module",
     "publishConfig": {
       "access": "public"
     },
     "bin": {
       "your-mcp-name": "./dist/index.js"
     },
     "scripts": {
       "build": "tsc",
       "dev": "tsx src/index.ts",
       "start": "node dist/index.js",
       "test": "vitest",
       "test:cov": "vitest --coverage",
       "lint": "eslint src/**/*.ts",
       "lint:fix": "eslint src/**/*.ts --fix"
     },
     "keywords": ["mcp", "your-keywords"],
     "author": "Arvore",
     "license": "MIT",
     "repository": {
       "type": "git",
       "url": "https://github.com/arvore-education/mcp-servers.git",
       "directory": "packages/your-mcp-name"
     },
     "dependencies": {
       "@modelcontextprotocol/sdk": "^1.0.0",
       "zod": "^3.22.4"
     }
   }
   ```

3. Create the source structure:

   ```
   packages/your-mcp-name/
   ├── src/
   │   ├── index.ts       # Entry point
   │   ├── server.ts      # MCP server implementation
   │   ├── tools.ts       # Tool definitions
   │   └── types.ts       # Type definitions
   ├── package.json
   ├── tsconfig.json
   ├── vitest.config.ts
   └── README.md
   ```

4. Copy configuration files from an existing package:

   - `tsconfig.json`
   - `vitest.config.ts`
   - `eslint.config.js`

5. Update the root `README.md` with your new package

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Write meaningful commit messages
- Add tests for new features
- Document public APIs

## Commit Messages

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test changes

Example:

```
feat(aws-secrets): add support for secret rotation

- Add rotation configuration
- Update documentation
- Add tests for rotation
```

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Ensure all tests pass (`pnpm test`)
3. Ensure linting passes (`pnpm lint`)
4. Build successfully (`pnpm build`)
5. Update version numbers if applicable
6. Create a pull request with a clear description

## Testing

- Write unit tests for all new functionality
- Ensure test coverage remains high
- Use Vitest for testing
- Mock external dependencies

## Documentation

- Update README.md for new features
- Add JSDoc comments for public APIs
- Include usage examples
- Update configuration examples if needed

## Questions?

If you have questions, please open an issue for discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
