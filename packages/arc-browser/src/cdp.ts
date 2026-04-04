const CDP_BASE = "http://localhost:9222";

interface CDPTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

interface CDPMessage {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  params?: Record<string, unknown>;
}

export class CDPClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
    }
  >();
  private eventHandlers = new Map<string, ((params: Record<string, unknown>) => void)[]>();
  private targetId: string | null = null;

  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${CDP_BASE}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listTargets(): Promise<CDPTarget[]> {
    const res = await fetch(`${CDP_BASE}/json/list`);
    return res.json() as Promise<CDPTarget[]>;
  }

  async getPageTargets(): Promise<CDPTarget[]> {
    const targets = await this.listTargets();
    return targets.filter((t) => t.type === "page");
  }

  async connectToPage(targetId?: string): Promise<void> {
    const pages = await this.getPageTargets();
    const target = targetId
      ? pages.find((p) => p.id === targetId)
      : pages[0];

    if (!target) throw new Error("No page target found in Arc");

    await this.connectWs(target.webSocketDebuggerUrl);
    this.targetId = target.id;
  }

  private connectWs(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      this.ws = new WebSocket(url);

      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (e) =>
        reject(new Error(`WebSocket error: ${(e as ErrorEvent).message ?? "unknown"}`))
      );

      this.ws.addEventListener("message", (event) => {
        const msg: CDPMessage = JSON.parse(
          typeof event.data === "string" ? event.data : event.data.toString()
        );

        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const handler = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`CDP Error: ${msg.error.message}`));
          } else {
            handler.resolve(msg.result ?? {});
          }
        }

        if (msg.method && msg.params) {
          const handlers = this.eventHandlers.get(msg.method) ?? [];
          for (const h of handlers) h(msg.params);
        }
      });
    });
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout for ${method}`));
        }
      }, timeoutMs);
    });
  }

  on(event: string, handler: (params: Record<string, unknown>) => void): () => void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
    return () => {
      const current = this.eventHandlers.get(event) ?? [];
      this.eventHandlers.set(
        event,
        current.filter((h) => h !== handler)
      );
    };
  }

  off(event: string, handler?: (params: Record<string, unknown>) => void): void {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }
    const current = this.eventHandlers.get(event) ?? [];
    this.eventHandlers.set(
      event,
      current.filter((h) => h !== handler)
    );
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [id, handler] of this.pending) {
      handler.reject(new Error("WebSocket closed"));
      this.pending.delete(id);
    }
    this.pending.clear();
    this.eventHandlers.clear();
    this.targetId = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get currentTargetId(): string | null {
    return this.targetId;
  }

  async click(selector: string): Promise<{ x: number; y: number }> {
    const result = await this.send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`,
      returnByValue: true,
    });

    const val = (result.result as { value?: { x: number; y: number } | null }).value;
    if (!val) throw new Error(`Element not found: ${selector}`);

    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: val.x,
      y: val.y,
      button: "left",
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: val.x,
      y: val.y,
      button: "left",
      clickCount: 1,
    });

    return val;
  }

  async hover(selector: string): Promise<{ x: number; y: number }> {
    const result = await this.send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`,
      returnByValue: true,
    });

    const val = (result.result as { value?: { x: number; y: number } | null }).value;
    if (!val) throw new Error(`Element not found: ${selector}`);

    await this.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: val.x,
      y: val.y,
    });

    return val;
  }

  async type(text: string): Promise<void> {
    for (const char of text) {
      await this.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: char,
      });
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        text: char,
      });
    }
  }

  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x,
      y,
      deltaX,
      deltaY,
    });
  }

  async waitForSelector(selector: string, timeoutMs = 5000): Promise<boolean> {
    const result = await this.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => {
        const existing = document.querySelector(${JSON.stringify(selector)});
        if (existing) { resolve(true); return; }
        const observer = new MutationObserver(() => {
          if (document.querySelector(${JSON.stringify(selector)})) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(false); }, ${timeoutMs});
      })`,
      awaitPromise: true,
      returnByValue: true,
    }, timeoutMs + 5_000);

    return (result.result as { value?: boolean }).value ?? false;
  }
}
