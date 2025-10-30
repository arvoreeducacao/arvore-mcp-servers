# Publishing Packages

This project automatically publishes packages to GitHub Package Registry through GitHub Actions.

## How to Publish

### 1. Create a Version Tag

To publish a new version, create a tag following the semver pattern:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or to manually publish a specific package:

```bash
git tag aws-secrets-manager-v1.0.1
git push origin aws-secrets-manager-v1.0.1
```

### 2. Automated Pipeline

When you push a tag starting with `v`, the pipeline automatically:

1. Runs tests (`pnpm test:cov`)
2. Runs linter (`pnpm lint`)
3. Builds all packages (`pnpm build`)
4. Publishes packages to GitHub Package Registry

### 3. Manual Publishing

If needed, you can also trigger publishing manually:

1. Go to: `Actions` → `Publish Packages` → `Run workflow`
2. Select the desired branch
3. Click `Run workflow`

## Installing Published Packages

To install packages from GitHub Registry, configure your `.npmrc`:

```bash
echo "@arvore:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

Then install normally:

```bash
pnpm add @arvore/aws-secrets-manager-mcp
pnpm add @arvore/datadog-mcp
pnpm add @arvore/mysql-mcp
pnpm add @arvore/npm-registry-mcp
```

## Available Packages

- `@arvore/aws-secrets-manager-mcp` - MCP Server for AWS Secrets Manager
- `@arvore/datadog-mcp` - MCP Server for Datadog
- `@arvore/mysql-mcp` - MCP Server for MySQL (read-only)
- `@arvore/npm-registry-mcp` - MCP Server for NPM Registry

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (v1.0.0 → v2.0.0): Breaking changes
- **MINOR** (v1.0.0 → v1.1.0): New features (backward compatible)
- **PATCH** (v1.0.0 → v1.0.1): Bug fixes

To update versions of all packages:

```bash
pnpm -r exec npm version patch  # For patches
pnpm -r exec npm version minor  # For minor releases
pnpm -r exec npm version major  # For major releases
```

Or for a specific package:

```bash
cd packages/aws-secrets-manager
npm version patch
```

## Common Issues

### Authentication Failure

If publishing fails due to authentication issues, verify that:

1. The repository has correct permissions in Settings → Actions → General → Workflow permissions
2. Check "Read and write permissions"

### Package Already Exists

If you try to publish a version that already exists, update the version in the package's `package.json`:

```bash
cd packages/package-name
npm version patch
git add package.json
git commit -m "chore: bump version"
git push
git tag v1.0.1
git push origin v1.0.1
```
