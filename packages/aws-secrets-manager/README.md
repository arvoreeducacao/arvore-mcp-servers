# AWS Secrets Manager MCP Server

MCP server for managing AWS Secrets Manager secrets.

## Features

- Create new secrets
- Update existing secrets
- Get secret values
- List all secrets
- Delete secrets
- Describe secret metadata

## Setup

### Prerequisites

- Node.js 18+
- AWS credentials configured

### Installation

```bash
pnpm install
```

### Configuration

You can configure AWS credentials in multiple ways:

#### Option 1: Using AWS Profile (Recommended)

Use an AWS profile from your `~/.aws/credentials` and `~/.aws/config`:

```bash
AWS_PROFILE=your-profile-name
AWS_REGION=us-east-1
```

This method supports IAM roles with assume role automatically.

#### Option 2: Using Direct Credentials

Set the following environment variables:

```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

#### Option 3: AWS SDK Default Credential Chain

Leave environment variables unset to use the AWS SDK default credential chain (recommended for EC2/ECS/Lambda environments).

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
pnpm test:cov
```

## Usage

Configure your MCP client to connect to this server using stdio transport.

### Tools

#### create_secret

Create a new secret in AWS Secrets Manager.

**Parameters:**

- `name` (string, required): Secret name
- `secretValue` (string, required): Secret value
- `description` (string, optional): Secret description
- `tags` (object, optional): Key-value tags

#### update_secret

Update an existing secret value.

**Parameters:**

- `secretId` (string, required): Secret name or ARN
- `secretValue` (string, required): New secret value

#### get_secret

Retrieve a secret value.

**Parameters:**

- `secretId` (string, required): Secret name or ARN
- `versionStage` (string, optional): Version stage (default: AWSCURRENT)

#### list_secrets

List all secrets.

**Parameters:**

- `maxResults` (number, optional): Maximum number of results

#### delete_secret

Delete a secret.

**Parameters:**

- `secretId` (string, required): Secret name or ARN
- `forceDelete` (boolean, optional): Force delete without recovery window
- `recoveryWindowInDays` (number, optional): Recovery window (7-30 days)

#### describe_secret

Get secret metadata.

**Parameters:**

- `secretId` (string, required): Secret name or ARN

## License

MIT

# aws-secret-manager-mcp
