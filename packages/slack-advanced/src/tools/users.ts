import { SlackClient } from "../slack-client.js";
import type {
  SearchUsersParams,
  GetUserProfileParams,
  GetUserInfoParams,
  McpToolResult,
} from "../types.js";
import { toolError, toolOk } from "./result.js";
import { rankUsers } from "../user-match.js";

export class UserTools {
  constructor(private readonly slack: SlackClient) {}

  async searchUsers(params: SearchUsersParams): Promise<McpToolResult> {
    try {
      const users = await this.slack.getAllUsers();

      const results = rankUsers(users, params.query)
        .slice(0, params.limit)
        .map((r) => ({
          id: r.user.id,
          name: r.user.name,
          real_name: r.user.real_name,
          display_name: r.user.display_name,
          email: r.user.email,
          ...(r.user.external && { external: true, team_id: r.user.team_id ?? null }),
          score: r.score,
        }));

      return toolOk(results);
    } catch (error) {
      return toolError(error);
    }
  }

  async getUserProfile(params: GetUserProfileParams): Promise<McpToolResult> {
    try {
      const users = await this.slack.getAllUsers();
      const user = users.find((u) => u.id === params.user_id);

      if (!user) {
        return toolError(`User not found: ${params.user_id}`);
      }

      const profile = user.profile as Record<string, unknown>;

      return toolOk({
        id: user.id,
        name: user.name,
        real_name: user.real_name,
        display_name: user.display_name,
        email: user.email,
        ...(user.external && { external: true, team_id: user.team_id ?? null }),
        title: profile.title ?? null,
        status: profile.status_text
          ? `${profile.status_emoji ?? ""} ${profile.status_text}`
          : null,
        timezone: profile.tz_label ?? null,
        image: profile.image_192 ?? profile.image_72 ?? null,
      });
    } catch (error) {
      return toolError(error);
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

      return toolOk({
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
      return toolError(error);
    }
  }
}
