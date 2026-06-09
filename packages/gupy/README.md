# @arvoretech/gupy-mcp

MCP server for [Gupy](https://developers.gupy.io) — manage jobs, applications, candidates, and webhooks from your AI assistant.

## Authentication

Uses Bearer tokens (RFC 6750). Generate your token in **Setup → Tokens Generation** in the Gupy admin panel. The token is sent in the `Authorization: Bearer <token>` header on every request.

> The Gupy API is available only on Premium and Enterprise plans.

## Configuration

```json
{
  "mcpServers": {
    "gupy": {
      "command": "npx",
      "args": ["-y", "@arvoretech/gupy-mcp"],
      "env": {
        "GUPY_API_TOKEN": "your-bearer-token",
        "GUPY_API_URL": "https://api.gupy.io"
      }
    }
  }
}
```

`GUPY_API_URL` is optional and defaults to `https://api.gupy.io`.

## Tools

### Jobs
- `list_jobs` — list jobs with filters (status, code, name)
- `get_job` — get job details by ID
- `update_job_status` — change a job's status (publish, suspend, close, etc.)

### Applications
- `list_applications` — list applications for a job
- `move_application` — move an application to a different step
- `tag_application` — add tags to an application
- `create_application_comment` — add a comment to a candidate's timeline
- `list_application_comments` — list comments on a candidate's timeline
- `send_candidate_message` — send an email to the candidate

### Candidates
- `list_candidates` — list candidates with email and `manuallyAdded` filters

### Webhooks
- `list_webhooks` — list webhook configurations
- `create_webhook` — register a new webhook for events
- `delete_webhook` — remove a webhook configuration

### Escape hatch
- `gupy_request` — make any authenticated request to the Gupy API. Use this for endpoints not covered by the typed tools (e.g. `/api/v2/jobs`, position management, departments, custom fields, pre-employees, contracts).

## References

- [Authentication](https://developers.gupy.io/reference/authentication)
- [API Reference](https://developers.gupy.io/reference)
- [Webhooks](https://developers.gupy.io/reference/webhooks)
- [Job state changes](https://developers.gupy.io/docs/mudanças-de-estado-de-uma-vaga)
