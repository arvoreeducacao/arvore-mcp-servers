import { SlackClient } from "../slack-client.js";
import type {
  SearchUsersParams,
  GetUserProfileParams,
  GetUserInfoParams,
  McpToolResult,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class UserTools {
  constructor(private readonly slack: SlackClient) {}

  async searchUsers(params: SearchUsersParams): Promise<McpToolResult> {
    try {
      const users = await this.slack.getAllUsers();
      const query = params.query.toLowerCase();

      const scored = users
        .map((u) => {
          const fields = [u.name, u.real_name, u.display_name, u.email].map((f) =>
            f.toLowerCase()
          );

          let score = 0;

          for (const field of fields) {
            if (field === query) {
              score = Math.max(score, 100);
            } else if (field.startsWith(query)) {
              score = Math.max(score, 80);
            } else if (field.includes(query)) {
              score = Math.max(score, 60);
            } else {
              const fuzzyScore = this.fuzzyMatch(query, field);
              score = Math.max(score, fuzzyScore);
            }
          }

          return { user: u, score };
        })
        .filter((r) => r.score > 20)
        .sort((a, b) => b.score - a.score)
        .slice(0, params.limit);

      const results = scored.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        real_name: r.user.real_name,
        display_name: r.user.display_name,
        email: r.user.email,
        score: r.score,
      }));

      return this.ok(results);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getUserProfile(params: GetUserProfileParams): Promise<McpToolResult> {
    try {
      const users = await this.slack.getAllUsers();
      const user = users.find((u) => u.id === params.user_id);

      if (!user) {
        return this.ok({ error: `User not found: ${params.user_id}` });
      }

      const profile = user.profile as Record<string, unknown>;

      return this.ok({
        id: user.id,
        name: user.name,
        real_name: user.real_name,
        display_name: user.display_name,
        email: user.email,
        title: profile.title ?? null,
        status: profile.status_text
          ? `${profile.status_emoji ?? ""} ${profile.status_text}`
          : null,
        timezone: profile.tz_label ?? null,
        image: profile.image_192 ?? profile.image_72 ?? null,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getUserInfo(params: GetUserInfoParams): Promise<McpToolResult> {
    try {
      const userId = await this.slack.resolveUserId(params.user);
      const [userInfo, presence] = await Promise.all([
        this.slack.getUserInfo(userId),
        this.slack.getUserPresence(userId),
      ]);

      const profile = (userInfo.profile ?? {}) as Record<string, unknown>;

      return this.ok({
        id: userInfo.id,
        name: userInfo.name,
        real_name: userInfo.real_name ?? null,
        display_name: profile.display_name ?? null,
        email: profile.email ?? null,
        title: profile.title ?? null,
        phone: profile.phone ?? null,
        skype: profile.skype ?? null,
        status: profile.status_text
          ? `${profile.status_emoji ?? ""} ${profile.status_text}`.trim()
          : null,
        status_expiration: profile.status_expiration ?? null,
        presence,
        timezone: userInfo.tz ?? null,
        timezone_label: userInfo.tz_label ?? null,
        timezone_offset: userInfo.tz_offset ?? null,
        locale: userInfo.locale ?? null,
        is_admin: userInfo.is_admin ?? false,
        is_owner: userInfo.is_owner ?? false,
        is_primary_owner: userInfo.is_primary_owner ?? false,
        is_restricted: userInfo.is_restricted ?? false,
        is_ultra_restricted: userInfo.is_ultra_restricted ?? false,
        is_bot: userInfo.is_bot ?? false,
        is_app_user: userInfo.is_app_user ?? false,
        deleted: userInfo.deleted ?? false,
        updated: userInfo.updated ?? null,
        image_24: profile.image_24 ?? null,
        image_72: profile.image_72 ?? null,
        image_192: profile.image_192 ?? null,
        image_512: profile.image_512 ?? null,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  private fuzzyMatch(query: string, target: string): number {
    if (target.length === 0) return 0;

    let qi = 0;
    let matched = 0;
    let consecutive = 0;
    let maxConsecutive = 0;

    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (query[qi] === target[ti]) {
        matched++;
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
        qi++;
      } else {
        consecutive = 0;
      }
    }

    if (matched === 0) return 0;

    const coverage = matched / query.length;
    const consecutiveBonus = maxConsecutive / query.length;

    return Math.round((coverage * 30 + consecutiveBonus * 20) * (matched >= query.length ? 1 : 0.5));
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    const message =
      error instanceof SlackAdvancedMCPError
        ? `Slack Error: ${error.message}`
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error: Unknown error";

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
