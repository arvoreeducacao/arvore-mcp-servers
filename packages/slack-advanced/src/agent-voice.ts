import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HiveLink {
  token: string;
  relay: string;
}

export type AgentPost =
  | { posted: true; channel: string; ts: string }
  | { posted: false; reason: string; maybePosted?: boolean };

const RELAY_TIMEOUT_MS = 15_000;

export function readHiveLink(home: string = process.env.HIVE_HOME || join(homedir(), ".hive")): HiveLink | null {
  try {
    const link = JSON.parse(readFileSync(join(home, "slack-link.json"), "utf8"));
    if (typeof link?.token !== "string" || typeof link?.relay !== "string" || !link.token || !link.relay) return null;
    return { token: link.token, relay: link.relay.replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

// Posts as the Hive bot through the hive-slack-relay, so an agent's reply never carries the person's name.
export class AgentVoice {
  constructor(
    private readonly link: HiveLink | null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async replyInThread(channel: string, threadTs: string, text: string): Promise<AgentPost> {
    if (!this.link) return { posted: false, reason: "this machine has no Hive linked to Slack" };

    let said: { ok?: boolean; error?: string; channel?: string; ts?: string };
    try {
      const answer = await this.fetchImpl(`${this.link.relay}/api/chat.postMessage`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.link.token}`,
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: new URLSearchParams({ channel, thread_ts: threadTs, text }),
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      });
      said = await answer.json();
    } catch (error) {
      return {
        posted: false,
        maybePosted: true,
        reason: `the Hive relay did not answer: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (!said.ok || !said.ts) return { posted: false, reason: `the Hive relay refused: ${said.error ?? "no reason given"}` };
    return { posted: true, channel: said.channel ?? channel, ts: said.ts };
  }
}
