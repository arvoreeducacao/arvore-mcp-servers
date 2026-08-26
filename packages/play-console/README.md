# @arvoretech/play-console-mcp

MCP server for the Google Play Console — Android vitals (crash and ANR issues with stack traces, error counts, crash/ANR rates) and user reviews, authenticated with a service account. Read-only.

## Tools

| Tool                    | Description                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps_list`             | Apps the service account can read + packages configured for this server                              |
| `vitals_issues_search`  | The "Crashes and ANRs" list: grouped issues with counts, affected users, versions, console link, optional sample stack traces |
| `vitals_reports_search` | Individual reports with full stack trace, device, API level and version; filter by `issueId`         |
| `vitals_error_counts`   | Daily report/user counts by `reportType`, `apiLevel`, `versionCode`, `deviceModel`, `issueId`, …     |
| `vitals_crash_rate`     | Daily crash rate + 7d/28d user-weighted rates, optional breakdown                                    |
| `vitals_anr_rate`       | Daily ANR rate + 7d/28d user-weighted rates, optional breakdown                                      |
| `reviews_list`          | Recent Play Store reviews with developer replies                                                     |

Issues and reports use an hourly UTC window ending now; rate/count metric sets use daily buckets in `America/Los_Angeles` ending at the latest date Google has processed (the `freshness` of the metric set), which is how the Play Console dashboard slices them.

## Setup

1. In the Google Cloud project that owns the Play Console link, enable **Google Play Developer Reporting API** and **Google Play Android Developer API**.
2. Create (or reuse) a service account and download a JSON key.
3. In Play Console → **Users and permissions**, invite the service account e-mail and grant, per app, at least **View app information and download bulk reports (read-only)** — vitals and reviews are covered by it.

## Configuration

```env
PLAY_CONSOLE_SERVICE_ACCOUNT_FILE=/path/to/key.json
# or the raw JSON:
# PLAY_CONSOLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Comma-separated; the first one is the default when a tool call omits packageName
PLAY_CONSOLE_PACKAGES=arvoredelivros.com.br.arvore,br.com.arvore.biblion
```

## Usage

```json
{
  "mcpServers": {
    "play-console": {
      "command": "npx",
      "args": ["-y", "@arvoretech/play-console-mcp"],
      "env": {
        "PLAY_CONSOLE_SERVICE_ACCOUNT_FILE": "/path/to/key.json",
        "PLAY_CONSOLE_PACKAGES": "com.example.app"
      }
    }
  }
}
```

## Filters

`filter` accepts the AIP-160 syntax of the Reporting API and is ANDed with the type/issue filters the tool builds, e.g. `apiLevel = 33`, `versionCode = 1234`, `deviceBrand = "samsung"`, `isUserPerceived = true`, `appProcessState = FOREGROUND`.

## Development

```bash
pnpm install
pnpm build
pnpm test
```
