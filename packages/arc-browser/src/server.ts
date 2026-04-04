import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as arc from "./arc.js";
import { CDPClient } from "./cdp.js";

export class ArcBrowserMCPServer {
  private server: McpServer;
  private cdp: CDPClient;

  constructor() {
    this.server = new McpServer({
      name: "arc-browser-mcp",
      version: "1.0.0",
    });
    this.cdp = new CDPClient();
    this.setupTools();
  }

  private async ensureCDP(targetId?: string): Promise<CDPClient> {
    const needsReconnect =
      !this.cdp.connected ||
      (targetId && this.cdp.currentTargetId !== targetId);

    if (needsReconnect) {
      const available = await CDPClient.isAvailable();
      if (!available) {
        throw new Error(
          "CDP not available. Restart Arc with: open -a 'Arc' --args --remote-debugging-port=9222"
        );
      }
      await this.cdp.connectToPage(targetId);
    }
    return this.cdp;
  }

  private setupTools(): void {
    this.server.registerTool(
      "list_tabs",
      {
        title: "List Tabs",
        description: "List all open tabs across all Arc windows (via AppleScript)",
        inputSchema: {},
      },
      async () => {
        const tabs = await arc.listTabs();
        return { content: [{ type: "text" as const, text: JSON.stringify(tabs, null, 2) }] };
      }
    );

    this.server.registerTool(
      "get_active_tab",
      {
        title: "Get Active Tab",
        description: "Get the title and URL of the currently active tab",
        inputSchema: {},
      },
      async () => {
        const tab = await arc.getActiveTab();
        return { content: [{ type: "text" as const, text: JSON.stringify(tab, null, 2) }] };
      }
    );

    this.server.registerTool(
      "open_url",
      {
        title: "Open URL",
        description: "Open a URL in Arc Browser",
        inputSchema: { url: z.string().url().describe("URL to open in Arc") },
      },
      async (params) => {
        const { url } = z.object({ url: z.string().url() }).parse(params);
        await arc.openUrl(url);
        return { content: [{ type: "text" as const, text: `Opened ${url}` }] };
      }
    );

    this.server.registerTool(
      "search_tabs",
      {
        title: "Search Tabs",
        description: "Search open tabs by title or URL",
        inputSchema: {
          query: z.string().describe("Search query to match against tab titles and URLs"),
        },
      },
      async (params) => {
        const { query } = z.object({ query: z.string() }).parse(params);
        const tabs = await arc.searchTabs(query);
        return { content: [{ type: "text" as const, text: JSON.stringify(tabs, null, 2) }] };
      }
    );

    this.server.registerTool(
      "close_tab",
      {
        title: "Close Tab",
        description: "Close a tab by its exact URL",
        inputSchema: {
          url: z.string().url().describe("Exact URL of the tab to close"),
        },
      },
      async (params) => {
        const { url } = z.object({ url: z.string().url() }).parse(params);
        const closed = await arc.closeTab(url);
        return {
          content: [{ type: "text" as const, text: closed ? `Closed tab: ${url}` : `Tab not found: ${url}` }],
        };
      }
    );

    this.server.registerTool(
      "focus_tab",
      {
        title: "Focus Tab",
        description: "Bring a specific tab to focus by its URL",
        inputSchema: {
          url: z.string().url().describe("URL of the tab to focus"),
        },
      },
      async (params) => {
        const { url } = z.object({ url: z.string().url() }).parse(params);
        const focused = await arc.focusTab(url);
        return {
          content: [{ type: "text" as const, text: focused ? `Focused: ${url}` : `Tab not found: ${url}` }],
        };
      }
    );

    this.server.registerTool(
      "execute_js",
      {
        title: "Execute JavaScript (AppleScript)",
        description: "Execute JavaScript in the active tab via AppleScript. Good for quick DOM queries. For complex scripts, use cdp_evaluate instead.",
        inputSchema: {
          code: z.string().describe("JavaScript code to execute"),
        },
      },
      async (params) => {
        const { code } = z.object({ code: z.string() }).parse(params);
        const result = await arc.executeJavaScript(code);
        return { content: [{ type: "text" as const, text: result }] };
      }
    );

    this.server.registerTool(
      "screenshot",
      {
        title: "Capture Screenshot",
        description: "Capture a screenshot of a page via CDP. Returns the image inline. Requires Arc to be running with --remote-debugging-port=9222.",
        inputSchema: {
          targetId: z.string().optional().describe("CDP target ID. If omitted, uses the first page tab."),
          fullPage: z.boolean().optional().describe("Capture the full scrollable page instead of just the viewport"),
        },
      },
      async (params) => {
        const { targetId, fullPage } = z
          .object({ targetId: z.string().optional(), fullPage: z.boolean().optional() })
          .parse(params);

        const cdp = await this.ensureCDP(targetId);

        let clip: Record<string, unknown> | undefined;
        if (fullPage) {
          const metrics = await cdp.send("Page.getLayoutMetrics");
          const cs = metrics.contentSize as { width: number; height: number };
          clip = { x: 0, y: 0, width: cs.width, height: cs.height, scale: 1 };
        }

        const result = await cdp.send("Page.captureScreenshot", {
          format: "png",
          ...(clip ? { clip, captureBeyondViewport: true } : {}),
        });

        return {
          content: [
            {
              type: "image" as const,
              data: result.data as string,
              mimeType: "image/png",
            },
          ],
        };
      }
    );

    this.server.registerTool(
      "cdp_evaluate",
      {
        title: "Evaluate JavaScript (CDP)",
        description: "Execute JavaScript in a page via CDP. Supports async/await and returns structured results.",
        inputSchema: {
          expression: z.string().describe("JavaScript expression to evaluate"),
          targetId: z.string().optional().describe("CDP target ID"),
          awaitPromise: z.boolean().optional().describe("Whether to await the result if it's a Promise (default: true)"),
        },
      },
      async (params) => {
        const { expression, targetId, awaitPromise } = z
          .object({
            expression: z.string(),
            targetId: z.string().optional(),
            awaitPromise: z.boolean().optional(),
          })
          .parse(params);

        const cdp = await this.ensureCDP(targetId);
        const result = await cdp.send("Runtime.evaluate", {
          expression,
          awaitPromise: awaitPromise ?? true,
          returnByValue: true,
        });

        const val = result.result as { value?: unknown; description?: string; type?: string };
        const text = val.value !== undefined ? JSON.stringify(val.value, null, 2) : val.description ?? String(val.type);

        return { content: [{ type: "text" as const, text }] };
      }
    );

    this.server.registerTool(
      "network_capture",
      {
        title: "Capture Network Requests",
        description: "Enable network monitoring and capture requests/responses for a specified duration. Useful for debugging API calls, checking what a page loads, etc.",
        inputSchema: {
          durationMs: z.number().min(1000).max(30000).optional().describe("How long to capture in milliseconds (default: 5000, max: 30000)"),
          urlFilter: z.string().optional().describe("Only capture requests whose URL contains this string"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { durationMs, urlFilter, targetId } = z
          .object({
            durationMs: z.number().min(1000).max(30000).optional(),
            urlFilter: z.string().optional(),
            targetId: z.string().optional(),
          })
          .parse(params);

        const cdp = await this.ensureCDP(targetId);
        const duration = durationMs ?? 5000;

        interface CapturedRequest {
          method: string;
          url: string;
          status?: number;
          mimeType?: string;
          timestamp: number;
        }

        const requests = new Map<string, CapturedRequest>();

        cdp.on("Network.requestWillBeSent", (p) => {
          const req = p.request as { method: string; url: string };
          const id = p.requestId as string;
          if (urlFilter && !req.url.includes(urlFilter)) return;
          requests.set(id, {
            method: req.method,
            url: req.url,
            timestamp: p.timestamp as number,
          });
        });

        cdp.on("Network.responseReceived", (p) => {
          const id = p.requestId as string;
          const resp = p.response as { status: number; mimeType: string };
          const existing = requests.get(id);
          if (existing) {
            existing.status = resp.status;
            existing.mimeType = resp.mimeType;
          }
        });

        await cdp.send("Network.enable");

        try {
          await new Promise((r) => setTimeout(r, duration));
        } finally {
          await cdp.send("Network.disable");
          cdp.off("Network.requestWillBeSent");
          cdp.off("Network.responseReceived");
        }

        const captured = [...requests.values()].map((r) => ({
          method: r.method,
          url: r.url.length > 200 ? r.url.substring(0, 200) + "..." : r.url,
          status: r.status ?? "pending",
          mimeType: r.mimeType ?? "unknown",
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: `Captured ${captured.length} requests in ${duration}ms:\n\n${JSON.stringify(captured, null, 2)}`,
            },
          ],
        };
      }
    );

    this.server.registerTool(
      "get_page_content",
      {
        title: "Get Page Content",
        description: "Get the text content of a page (title, URL, body text). Uses CDP if available, falls back to AppleScript.",
        inputSchema: {
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { targetId } = z.object({ targetId: z.string().optional() }).parse(params);

        const cdpAvailable = await CDPClient.isAvailable();

        if (cdpAvailable) {
          const cdp = await this.ensureCDP(targetId);
          const result = await cdp.send("Runtime.evaluate", {
            expression: "JSON.stringify({ title: document.title, url: location.href, text: document.body.innerText.substring(0, 50000) })",
            returnByValue: true,
          });
          const val = (result.result as { value?: string }).value ?? "{}";
          return { content: [{ type: "text" as const, text: val }] };
        }

        const tab = await arc.getActiveTab();
        const text = await arc.executeJavaScript("document.body.innerText.substring(0, 50000)");
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ...tab, text }, null, 2) }],
        };
      }
    );

    this.server.registerTool(
      "get_console_logs",
      {
        title: "Get Console Logs",
        description: "Capture console output (log, warn, error, info) from a page for a specified duration.",
        inputSchema: {
          durationMs: z.number().min(1000).max(30000).optional().describe("How long to capture in ms (default: 5000)"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { durationMs, targetId } = z
          .object({
            durationMs: z.number().min(1000).max(30000).optional(),
            targetId: z.string().optional(),
          })
          .parse(params);

        const cdp = await this.ensureCDP(targetId);
        const duration = durationMs ?? 5000;

        const logs: { level: string; text: string; timestamp: number }[] = [];

        cdp.on("Runtime.consoleAPICalled", (p) => {
          const args = p.args as { value?: unknown; description?: string }[];
          const text = args.map((a) => a.value ?? a.description ?? "").join(" ");
          logs.push({
            level: p.type as string,
            text,
            timestamp: p.timestamp as number,
          });
        });

        await cdp.send("Runtime.enable");
        try {
          await new Promise((r) => setTimeout(r, duration));
        } finally {
          await cdp.send("Runtime.disable");
          cdp.off("Runtime.consoleAPICalled");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: logs.length
                ? `Captured ${logs.length} console entries:\n\n${JSON.stringify(logs, null, 2)}`
                : `No console output captured in ${duration}ms`,
            },
          ],
        };
      }
    );

    this.server.registerTool(
      "get_cookies",
      {
        title: "Get Cookies",
        description: "Get cookies for the current page or a specific URL via CDP.",
        inputSchema: {
          url: z.string().optional().describe("URL to get cookies for. If omitted, gets cookies for the current page."),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { url, targetId } = z
          .object({ url: z.string().optional(), targetId: z.string().optional() })
          .parse(params);

        const cdp = await this.ensureCDP(targetId);
        const result = await cdp.send("Network.getCookies", url ? { urls: [url] } : {});
        const cookies = result.cookies as { name: string; value: string; domain: string }[];

        const summary = cookies.map((c) => ({
          name: c.name,
          value: c.value.length > 50 ? c.value.substring(0, 50) + "..." : c.value,
          domain: c.domain,
        }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      }
    );

    this.server.registerTool(
      "list_spaces",
      {
        title: "List Spaces",
        description: "List all Arc spaces with their tabs. Spaces are Arc's way of organizing tabs into groups.",
        inputSchema: {},
      },
      async () => {
        const spaces = await arc.listSpaces();
        return { content: [{ type: "text" as const, text: JSON.stringify(spaces, null, 2) }] };
      }
    );

    this.server.registerTool(
      "get_active_space",
      {
        title: "Get Active Space",
        description: "Get the name of the currently active Arc space.",
        inputSchema: {},
      },
      async () => {
        const name = await arc.getActiveSpace();
        return { content: [{ type: "text" as const, text: name }] };
      }
    );

    this.server.registerTool(
      "switch_space",
      {
        title: "Switch Space",
        description: "Switch to a different Arc space by name.",
        inputSchema: {
          title: z.string().describe("Name of the space to switch to"),
        },
      },
      async (params) => {
        const { title } = z.object({ title: z.string() }).parse(params);
        const result = await arc.switchSpace(title);
        const messages: Record<string, string> = {
          switched: `Switched to space: ${title}`,
          not_found: `Space not found: ${title}`,
          no_accessibility_permission:
            "Cannot switch spaces: grant Accessibility permission to the terminal in System Settings > Privacy & Security > Accessibility",
        };
        return {
          content: [{ type: "text" as const, text: messages[result] ?? result }],
        };
      }
    );

    this.server.registerTool(
      "click",
      {
        title: "Click Element",
        description: "Click on an element in the page by CSS selector. Uses CDP.",
        inputSchema: {
          selector: z.string().describe("CSS selector of the element to click (e.g. 'button.submit', '#login', 'a[href=\"/about\"]')"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { selector, targetId } = z
          .object({ selector: z.string(), targetId: z.string().optional() })
          .parse(params);
        const cdp = await this.ensureCDP(targetId);
        const pos = await cdp.click(selector);
        return {
          content: [{ type: "text" as const, text: `Clicked "${selector}" at (${Math.round(pos.x)}, ${Math.round(pos.y)})` }],
        };
      }
    );

    this.server.registerTool(
      "hover",
      {
        title: "Hover Element",
        description: "Hover over an element in the page by CSS selector. Uses CDP.",
        inputSchema: {
          selector: z.string().describe("CSS selector of the element to hover"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { selector, targetId } = z
          .object({ selector: z.string(), targetId: z.string().optional() })
          .parse(params);
        const cdp = await this.ensureCDP(targetId);
        const pos = await cdp.hover(selector);
        return {
          content: [{ type: "text" as const, text: `Hovered "${selector}" at (${Math.round(pos.x)}, ${Math.round(pos.y)})` }],
        };
      }
    );

    this.server.registerTool(
      "type_text",
      {
        title: "Type Text",
        description: "Type text into the currently focused element. Click on an input first, then use this to type. Uses CDP.",
        inputSchema: {
          text: z.string().describe("Text to type"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { text, targetId } = z
          .object({ text: z.string(), targetId: z.string().optional() })
          .parse(params);
        const cdp = await this.ensureCDP(targetId);
        await cdp.type(text);
        return {
          content: [{ type: "text" as const, text: `Typed ${text.length} characters` }],
        };
      }
    );

    this.server.registerTool(
      "scroll",
      {
        title: "Scroll Page",
        description: "Scroll the page. Positive deltaY scrolls down, negative scrolls up. Uses CDP.",
        inputSchema: {
          deltaY: z.number().describe("Vertical scroll amount in pixels. Positive = down, negative = up."),
          deltaX: z.number().optional().describe("Horizontal scroll amount in pixels. Positive = right, negative = left."),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { deltaY, deltaX, targetId } = z
          .object({
            deltaY: z.number(),
            deltaX: z.number().optional(),
            targetId: z.string().optional(),
          })
          .parse(params);
        const cdp = await this.ensureCDP(targetId);
        await cdp.scroll(0, 0, deltaX ?? 0, deltaY);
        return {
          content: [{ type: "text" as const, text: `Scrolled (${deltaX ?? 0}, ${deltaY})` }],
        };
      }
    );

    this.server.registerTool(
      "wait_for_selector",
      {
        title: "Wait for Selector",
        description: "Wait until an element matching the CSS selector appears in the DOM. Uses CDP.",
        inputSchema: {
          selector: z.string().describe("CSS selector to wait for"),
          timeoutMs: z.number().optional().describe("Max time to wait in ms (default: 5000)"),
          targetId: z.string().optional().describe("CDP target ID"),
        },
      },
      async (params) => {
        const { selector, timeoutMs, targetId } = z
          .object({
            selector: z.string(),
            timeoutMs: z.number().optional(),
            targetId: z.string().optional(),
          })
          .parse(params);
        const cdp = await this.ensureCDP(targetId);
        const found = await cdp.waitForSelector(selector, timeoutMs ?? 5000);
        return {
          content: [{ type: "text" as const, text: found ? `Found: ${selector}` : `Timeout waiting for: ${selector}` }],
        };
      }
    );

    this.server.registerTool(
      "cdp_status",
      {
        title: "CDP Status",
        description: "Check if Chrome DevTools Protocol is available and list connectable page targets.",
        inputSchema: {},
      },
      async () => {
        const available = await CDPClient.isAvailable();
        if (!available) {
          return {
            content: [
              {
                type: "text" as const,
                text: "CDP is NOT available. Restart Arc with:\n  open -a 'Arc' --args --remote-debugging-port=9222",
              },
            ],
          };
        }

        const pages = await this.cdp.getPageTargets();
        const summary = pages.map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url.length > 100 ? p.url.substring(0, 100) + "..." : p.url,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: `CDP available. ${pages.length} page targets:\n\n${JSON.stringify(summary, null, 2)}`,
            },
          ],
        };
      }
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    const cdpAvailable = await CDPClient.isAvailable();
    console.error(
      `✅ Arc Browser MCP Server started (CDP: ${cdpAvailable ? "available" : "not available — AppleScript only"})`
    );
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down...`);
      this.cdp.disconnect();
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
