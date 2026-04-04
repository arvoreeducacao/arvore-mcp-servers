# @arvoretech/arc-browser-mcp

MCP server for controlling Arc Browser on macOS. Uses a hybrid approach: AppleScript for tab/space management and Chrome DevTools Protocol (CDP) for advanced features like screenshots, network capture, and DOM interaction.

## Requirements

- macOS (AppleScript is macOS-only)
- Node.js >= 22
- Arc Browser

## Setup

### Basic (AppleScript only)

```json
{
  "arc-browser": {
    "command": "npx",
    "args": ["-y", "@arvoretech/arc-browser-mcp"],
    "autoApprove": ["*"]
  }
}
```

### Full (with CDP)

Start Arc with remote debugging enabled:

```bash
open -a "Arc" --args --remote-debugging-port=9222
```

Then use the same MCP config above. The server auto-detects CDP availability.

## Tools

### AppleScript (always available)

| Tool | Description |
|------|-------------|
| `list_tabs` | List all open tabs across all windows |
| `get_active_tab` | Get title and URL of the active tab |
| `open_url` | Open a URL in Arc |
| `search_tabs` | Search tabs by title or URL |
| `close_tab` | Close a tab by URL |
| `focus_tab` | Focus a tab by URL |
| `execute_js` | Execute JavaScript in the active tab |
| `list_spaces` | List all spaces with their tabs |
| `get_active_space` | Get the active space name |
| `switch_space` | Switch to a space by name |

### CDP (requires `--remote-debugging-port=9222`)

| Tool | Description |
|------|-------------|
| `screenshot` | Capture page screenshot (viewport or full page) |
| `cdp_evaluate` | Execute JS with async/await support |
| `network_capture` | Capture network requests for N seconds |
| `get_console_logs` | Capture console output for N seconds |
| `get_cookies` | Get cookies for current page or URL |
| `get_page_content` | Get page text (CDP with AppleScript fallback) |
| `click` | Click element by CSS selector |
| `hover` | Hover element by CSS selector |
| `type_text` | Type text into focused element |
| `scroll` | Scroll the page |
| `wait_for_selector` | Wait for element to appear in DOM |
| `cdp_status` | Check CDP availability and list targets |

## Security

- CDP listens on `localhost:9222` only (not exposed to network)
- No secrets or credentials in the package
- Consider not using `autoApprove: ["*"]` in shared environments

## License

MIT
