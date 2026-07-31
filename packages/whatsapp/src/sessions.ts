import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getSessionRoot, getSessionsRoot, sessionSlug } from "./paths.js";
import { WhatsAppClient } from "./whatsapp-client.js";

export type SessionSummary = {
  key: string;
  state: string;
  phone: string | null;
  paired: boolean;
};

export class SessionManager {
  private readonly clients = new Map<string, WhatsAppClient>();

  constructor(private readonly renderTerminalQr = false) {}

  get(key: string): WhatsAppClient {
    const slug = sessionSlug(key);
    const existing = this.clients.get(slug);
    if (existing) return existing;

    const client = new WhatsAppClient({
      root: getSessionRoot(slug),
      label: slug,
      renderTerminalQr: this.renderTerminalQr,
    });
    this.clients.set(slug, client);
    return client;
  }

  list(): SessionSummary[] {
    return [...this.clients.entries()].map(([key, client]) => ({
      key,
      state: client.getStatus().state,
      phone: client.getStatus().phone,
      paired: client.hasAuthState(),
    }));
  }

  restorePaired(): string[] {
    const root = getSessionsRoot();
    const restored: string[] = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(join(root, entry.name, "auth", "creds.json"))) continue;

      const client = this.get(entry.name);
      restored.push(entry.name);
      client.connect().catch((error) => {
        process.stderr.write(`[whatsapp-mcp] ${entry.name} restore failed: ${error}\n`);
      });
    }

    return restored;
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect().catch(() => undefined);
      client.store.close();
    }
  }
}
