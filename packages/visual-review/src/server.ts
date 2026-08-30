import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getChangedRoutes, getComponentRoutes, setDynamicSegmentDefaults } from "./git-analyzer.js";
import { startWebServer, stopWebServer } from "./web-server.js";
import type { ReviewSession } from "./types.js";

export class VisualReviewMCPServer {
  private readonly server: McpServer;
  private session: ReviewSession | null = null;

  constructor() {
    this.server = new McpServer({
      name: "visual-review-mcp",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "start_visual_review",
      {
        title: "Start Visual Review",
        description: "Analyze git diff, detect changed routes, and start the visual comparison UI server",
        inputSchema: {
          repoPath: z.string().describe("Absolute path to the frontend repository"),
          accessToken: z.string().optional().describe("Access token (optional — UI uses iframe with browser session)"),
          baseUrl: z.string().default("http://localhost:3000").describe("Base URL of the running frontend dev server"),
          port: z.number().default(4200).describe("Port for the visual review UI server"),
          localePrefix: z.string().default("app-v2").describe("Value to replace [locale] segment in routes"),
        },
      },
      async ({ repoPath, accessToken, baseUrl, port, localePrefix }) => {
        const figmaApiKey = process.env.FIGMA_API_KEY || process.env.FIGMA_PERSONAL_ACCESS_TOKEN || "";

        setDynamicSegmentDefaults({ "[locale]": localePrefix });

        const directRoutes = getChangedRoutes(repoPath, baseUrl);
        const componentRoutes = getComponentRoutes(repoPath, baseUrl);

        const routeMap = new Map<string, typeof directRoutes[0]>();
        for (const r of [...directRoutes, ...componentRoutes]) {
          const existing = routeMap.get(r.route);
          if (existing) {
            existing.files = [...new Set([...existing.files, ...r.files])];
          } else {
            routeMap.set(r.route, { ...r });
          }
        }

        const routes = Array.from(routeMap.values());

        this.session = {
          id: Date.now().toString(36),
          repoPath,
          baseUrl,
          accessToken: accessToken || "",
          routes,
          port,
          figmaApiKey,
        };

        const url = startWebServer(this.session);

        const routeList = routes.map(r => `  • ${r.route} (${r.files.length} files)`).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: [
              `Visual Review started at: ${url}`,
              ``,
              `Detected ${routes.length} changed route(s):`,
              routeList || "  (no route changes detected)",
              ``,
              `Open ${url} in your browser to compare routes with Figma designs.`,
              figmaApiKey ? "Figma API key detected — you can paste Figma URLs in the UI." : "⚠️ No FIGMA_API_KEY found — set it to enable Figma comparison.",
            ].join("\n"),
          }],
        };
      }
    );

    this.server.registerTool(
      "get_changed_routes",
      {
        title: "Get Changed Routes",
        description: "List frontend routes affected by current git changes without starting the UI",
        inputSchema: {
          repoPath: z.string().describe("Absolute path to the frontend repository"),
          baseUrl: z.string().default("http://localhost:3000").describe("Base URL of the frontend dev server"),
        },
      },
      async ({ repoPath, baseUrl }) => {
        const directRoutes = getChangedRoutes(repoPath, baseUrl);
        const componentRoutes = getComponentRoutes(repoPath, baseUrl);

        const routeMap = new Map<string, typeof directRoutes[0]>();
        for (const r of [...directRoutes, ...componentRoutes]) {
          const existing = routeMap.get(r.route);
          if (existing) {
            existing.files = [...new Set([...existing.files, ...r.files])];
          } else {
            routeMap.set(r.route, { ...r });
          }
        }

        const routes = Array.from(routeMap.values());

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(routes, null, 2),
          }],
        };
      }
    );

    this.server.registerTool(
      "stop_visual_review",
      {
        title: "Stop Visual Review",
        description: "Stop the visual review UI server",
        inputSchema: {},
      },
      async () => {
        stopWebServer();
        this.session = null;
        return {
          content: [{
            type: "text" as const,
            text: "Visual Review server stopped.",
          }],
        };
      }
    );

    this.server.registerTool(
      "generate_fix_prompt",
      {
        title: "Generate Fix Prompt",
        description: "Generate a prompt for the AI to fix visual differences on a specific route",
        inputSchema: {
          route: z.string().describe("The route path to generate fix prompt for"),
          figmaUrl: z.string().describe("Figma URL of the design to compare against"),
          diffPercentage: z.number().optional().describe("Diff percentage if already computed"),
          figmaWidth: z.number().default(1440).describe("Figma frame width"),
          figmaHeight: z.number().default(900).describe("Figma frame height"),
        },
      },
      async ({ route, figmaUrl, diffPercentage, figmaWidth, figmaHeight }) => {
        const prompt = [
          `Fix the visual differences on route "${route}".`,
          ``,
          `Figma reference: ${figmaUrl}`,
          `Frame dimensions: ${figmaWidth}x${figmaHeight}px`,
          diffPercentage ? `Current pixel diff: ${diffPercentage}%` : "",
          ``,
          `Instructions:`,
          `1. Fetch the Figma frame using the URL above`,
          `2. Compare with the current implementation at ${this.session?.baseUrl || "http://localhost:3000"}${route}`,
          `3. Fix spacing, colors, typography, and layout to match Figma exactly`,
          `4. Ensure viewport matches Figma dimensions (${figmaWidth}x${figmaHeight}px)`,
          `5. Use Bonsai design tokens wherever possible`,
        ].filter(Boolean).join("\n");

        return {
          content: [{
            type: "text" as const,
            text: prompt,
          }],
        };
      }
    );
  }

  async start(): Promise<void> {
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
