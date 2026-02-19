import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  GoogleChatClientConfig,
  GoogleChatMCPError,
  ServiceAccountKey,
  TokenResponse,
} from "./types.js";

const BASE_URL = "https://chat.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const USER_SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships.readonly",
];

const BOT_SCOPES = ["https://www.googleapis.com/auth/chat.bot"];

export class GoogleChatClient {
  private serviceAccount: ServiceAccountKey | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private config: GoogleChatClientConfig;

  constructor(config: GoogleChatClientConfig) {
    this.config = config;
  }

  private async loadServiceAccount(): Promise<ServiceAccountKey> {
    if (this.serviceAccount) return this.serviceAccount;

    let json: string;
    if (this.config.credentialsJson) {
      json = this.config.credentialsJson;
    } else if (this.config.credentialsPath) {
      json = await readFile(this.config.credentialsPath, "utf-8");
    } else {
      throw new GoogleChatMCPError(
        "No credentials provided. Set GOOGLE_CHAT_CREDENTIALS_PATH or GOOGLE_CHAT_CREDENTIALS_JSON",
        "AUTH_ERROR"
      );
    }

    this.serviceAccount = JSON.parse(json) as ServiceAccountKey;
    return this.serviceAccount;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const sa = await this.loadServiceAccount();
    const scopes =
      this.config.scopes ||
      (this.config.userEmail ? USER_SCOPES : BOT_SCOPES);

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload: Record<string, unknown> = {
      iss: sa.client_email,
      scope: scopes.join(" "),
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };

    if (this.config.userEmail) {
      payload.sub = this.config.userEmail;
    }

    const base64Header = Buffer.from(JSON.stringify(header)).toString(
      "base64url"
    );
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const signatureInput = `${base64Header}.${base64Payload}`;

    const sign = createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(sa.private_key, "base64url");

    const jwt = `${signatureInput}.${signature}`;

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleChatMCPError(
        `Token exchange failed: ${response.status} ${error}`,
        "AUTH_ERROR",
        response.status
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    this.accessToken = tokenData.access_token;
    this.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

    return this.accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<T> {
    const token = await this.getAccessToken();

    let url = `${BASE_URL}${path}`;
    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== "") {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleChatMCPError(
        `Google Chat API error: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as T;
  }

  async listSpaces(params: {
    filter?: string;
    pageSize?: number;
    pageToken?: string;
  }) {
    const queryParams: Record<string, string> = {};
    if (params.pageSize) queryParams.pageSize = String(params.pageSize);
    if (params.pageToken) queryParams.pageToken = params.pageToken;
    if (params.filter) queryParams.filter = params.filter;

    return this.request<{
      spaces: Record<string, unknown>[];
      nextPageToken?: string;
    }>("GET", "/spaces", undefined, queryParams);
  }

  async getSpace(spaceName: string) {
    const name = normalizeSpaceName(spaceName);
    return this.request<Record<string, unknown>>("GET", `/${name}`);
  }

  async listMembers(params: {
    spaceName: string;
    pageSize?: number;
    pageToken?: string;
  }) {
    const name = normalizeSpaceName(params.spaceName);
    const queryParams: Record<string, string> = {};
    if (params.pageSize) queryParams.pageSize = String(params.pageSize);
    if (params.pageToken) queryParams.pageToken = params.pageToken;

    return this.request<{
      memberships: Record<string, unknown>[];
      nextPageToken?: string;
    }>("GET", `/${name}/members`, undefined, queryParams);
  }

  async listMessages(params: {
    spaceName: string;
    pageSize?: number;
    pageToken?: string;
    filter?: string;
    orderBy?: string;
    showDeleted?: boolean;
  }) {
    const name = normalizeSpaceName(params.spaceName);
    const queryParams: Record<string, string> = {};
    if (params.pageSize) queryParams.pageSize = String(params.pageSize);
    if (params.pageToken) queryParams.pageToken = params.pageToken;
    if (params.filter) queryParams.filter = params.filter;
    if (params.orderBy) queryParams.orderBy = params.orderBy;
    if (params.showDeleted) queryParams.showDeleted = "true";

    return this.request<{
      messages: Record<string, unknown>[];
      nextPageToken?: string;
    }>("GET", `/${name}/messages`, undefined, queryParams);
  }

  async getMessage(messageName: string) {
    return this.request<Record<string, unknown>>("GET", `/${messageName}`);
  }

  async createMessage(params: {
    spaceName: string;
    text: string;
    threadKey?: string;
    threadName?: string;
    messageReplyOption?: string;
  }) {
    const name = normalizeSpaceName(params.spaceName);

    const body: Record<string, unknown> = { text: params.text };

    if (params.threadKey || params.threadName) {
      const thread: Record<string, string> = {};
      if (params.threadKey) thread.threadKey = params.threadKey;
      if (params.threadName) thread.name = params.threadName;
      body.thread = thread;
    }

    const queryParams: Record<string, string> = {};
    if (params.threadKey) queryParams.threadKey = params.threadKey;
    if (params.messageReplyOption) {
      queryParams.messageReplyOption = params.messageReplyOption;
    }

    return this.request<Record<string, unknown>>(
      "POST",
      `/${name}/messages`,
      body,
      queryParams
    );
  }

  async deleteMessage(messageName: string) {
    return this.request<Record<string, unknown>>(
      "DELETE",
      `/${messageName}`
    );
  }
}

function normalizeSpaceName(name: string): string {
  return name.startsWith("spaces/") ? name : `spaces/${name}`;
}
