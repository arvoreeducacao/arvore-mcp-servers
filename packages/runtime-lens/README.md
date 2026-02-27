# @arvoretech/runtime-lens-mcp

Runtime Lens — Runtime inspection with inline values for React, NestJS and Next.js.

Two components in one package:
1. VS Code/Cursor/Kiro extension with inline value display
2. MCP server for AI-assisted debugging

## Setup

### 1. Build

```bash
cd packages/runtime-lens
pnpm install
pnpm build:all    # builds MCP server + extension + agent
```

### 2. Install the Extension

After building, package and install the `.vsix`:

```bash
pnpm package                                    # generates runtime-lens-1.0.0.vsix
code --install-extension runtime-lens-1.0.0.vsix  # VS Code
cursor --install-extension runtime-lens-1.0.0.vsix  # Cursor
```

For Kiro, use the Extensions panel to install from VSIX.

### 3. Configure the MCP Server

Add to your editor's MCP config (`.kiro/settings/mcp.json`, `.cursor/mcp.json`, etc.):

```json
{
  "mcpServers": {
    "runtime-lens": {
      "command": "npx",
      "args": ["-y", "@arvoretech/runtime-lens-mcp"],
      "env": {
        "RUNTIME_LENS_PROJECT_ROOT": "."
      }
    }
  }
}
```

## Usage

### Option A — Command Palette (per session)

1. Open the command palette and run `Runtime Lens: Start`
2. Then run `Runtime Lens: Inject Environment into Terminal`
3. Start your app normally in that terminal (`pnpm dev`, `npm start`, etc.)
4. Runtime values appear inline in the editor

### Option B — Permanent Setup (recommended)

Add this to your `~/.zshrc` (or `~/.bashrc`):

```bash
# Runtime Lens — inject agent into all Node.js processes
export RUNTIME_LENS_AGENT_PATH="$(npm root -g)/@arvoretech/runtime-lens-mcp/dist/agent/index.js"
export NODE_OPTIONS="--require $RUNTIME_LENS_AGENT_PATH"
export RUNTIME_LENS_PORT="9500"
```

Before using, install the package globally:

```bash
npm install -g @arvoretech/runtime-lens-mcp
```

Then reload your shell:

```bash
source ~/.zshrc
```

Now every Node.js process you start will automatically connect to Runtime Lens. Just open the editor and run `Runtime Lens: Start` — no need to inject every time.

> **Warning:** Setting `NODE_OPTIONS` globally affects all Node.js processes, including tools like `npx`, `npm`, and MCP servers. If you experience issues, use a wrapper function instead:
>
> ```bash
> lens() {
>   local agent="$(npm root -g)/@arvoretech/runtime-lens-mcp/dist/agent/index.js"
>   NODE_OPTIONS="--require $agent" RUNTIME_LENS_PORT=9500 "$@"
> }
> # Usage: lens pnpm dev
> ```

## Extension Commands

| Command | Description |
|---------|-------------|
| `Runtime Lens: Start` | Start listening for runtime values |
| `Runtime Lens: Stop` | Stop and clear decorations |
| `Runtime Lens: Toggle` | Toggle on/off (status bar) |
| `Runtime Lens: Clear Inline Values` | Clear all inline decorations |
| `Runtime Lens: Connect to Running App` | Connect to an already running agent |
| `Runtime Lens: Inject Environment into Terminal` | Set NODE_OPTIONS in the active terminal |
| `Runtime Lens: Show Output` | Show the output channel |

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `runtimeLens.port` | `9500` | WebSocket port for the agent |
| `runtimeLens.autoStart` | `false` | Auto-start on workspace open |
| `runtimeLens.maxInlineLength` | `80` | Max inline text length |
| `runtimeLens.showTimestamp` | `false` | Show timestamp in inline values |

## MCP Tools

14 tools for AI-assisted runtime inspection:

| Tool | Description |
|------|-------------|
| `tail_logs` | Recent log entries with filtering |
| `search_logs` | Regex search through logs |
| `get_errors` | Errors with stack traces, groupable |
| `inspect_requests` | HTTP request/response inspection |
| `get_performance` | Memory, CPU metrics |
| `get_env_info` | Processes, ports, framework detection |
| `get_stats` | Log statistics by level/framework |
| `clear_logs` | Clear log buffer |
| `start_interceptor` / `stop_interceptor` | Real-time console capture |
| `collect_from_files` | Collect from log files |
| `scan_project` | Detect framework and configs |
| `find_processes` | Running Node.js processes |
| `get_listening_ports` | TCP ports in use |

## Development

```bash
pnpm install
pnpm build          # MCP server (tsc)
pnpm build:ext      # VS Code extension (esbuild)
pnpm build:agent    # Runtime agent (esbuild)
pnpm build:all      # Everything
pnpm test           # Run tests
```
