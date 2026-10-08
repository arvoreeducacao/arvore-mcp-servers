# Visual Review MCP

Compare changed frontend routes side-by-side with Figma designs. Detects which routes were affected by your current git changes and provides a visual comparison UI.

## Features

- **Git-aware route detection** — automatically finds routes affected by uncommitted changes
- **Figma integration** — fetches frames via Figma API with correct dimensions
- **Side-by-side comparison** — view local vs Figma next to each other
- **Overlay mode** — overlay Figma on top of local with adjustable opacity
- **Contrast/Diff mode** — pixel-level diff highlighting differences
- **Fix prompt generation** — generates a structured prompt for AI to fix visual gaps
- **Auto-resize** — matches viewport to Figma frame dimensions

## Tools

| Tool | Description |
|------|-------------|
| `start_visual_review` | Start the UI server with git diff analysis |
| `get_changed_routes` | List affected routes without starting UI |
| `stop_visual_review` | Stop the UI server |
| `generate_fix_prompt` | Generate AI prompt for fixing visual diffs |

## Usage

### Prerequisites

1. Frontend dev server running (e.g., `pnpm dev` on `localhost:3000`)
2. `FIGMA_API_KEY` environment variable set (for Figma comparison)
3. A valid access token for the frontend app

### Via MCP Tool

```
start_visual_review({
  repoPath: "/path/to/frontend-arvore-nextjs",
  accessToken: "eyJ...",
  baseUrl: "http://localhost:3000",
  port: 4200
})
```

Then open `http://localhost:4200` in your browser.

### Local Development

```bash
cd packages/visual-review
pnpm install
pnpm dev
```

Set environment variables:
```
FIGMA_API_KEY=your-figma-token
```

## How It Works

1. Analyzes `git diff` to find changed files in the frontend repo
2. Maps files to Next.js routes (handles route groups, layouts, components)
3. Starts an Express server serving the comparison UI
4. Captures page screenshots using Puppeteer with the provided access token
5. Fetches Figma frames via API and renders them side-by-side
6. Runs pixel-level comparison using pixelmatch
