import { TokenStore } from "./token-store.js";
import { refreshAccessToken } from "./oauth.js";
import {
  buildMimeMessage,
  encodeBase64Url,
  extractHeaders,
  extractBodyText,
} from "./mime.js";
import {
  GmailClientConfig,
  GmailMCPError,
  GmailMessage,
  OAuthCredentials,
} from "./types.js";

const BASE_URL = "https://gmail.googleapis.com/gmail/v1";

export class GmailClient {
  private config: GmailClientConfig;
  private tokenStore: TokenStore;
  private cachedCredentials: OAuthCredentials | null = null;

  constructor(config: GmailClientConfig) {
    this.config = config;
    this.tokenStore = new TokenStore(config.configDir);
  }

  private async loadCredentials(): Promise<OAuthCredentials> {
    if (this.cachedCredentials) return this.cachedCredentials;

    if (this.config.refreshToken) {
      this.cachedCredentials = {
        access_token: "",
        refresh_token: this.config.refreshToken,
        expires_at: 0,
        scope: "",
        token_type: "Bearer",
      };
      return this.cachedCredentials;
    }

    const stored = await this.tokenStore.load();
    if (!stored) {
      throw new GmailMCPError(
        "No credentials found. Run `gmail-mcp auth login` first or set GMAIL_MCP_REFRESH_TOKEN.",
        "AUTH_ERROR"
      );
    }

    this.cachedCredentials = stored;
    return stored;
  }

  private async getAccessToken(): Promise<string> {
    const creds = await this.loadCredentials();

    if (creds.access_token && Date.now() < creds.expires_at - 60_000) {
      return creds.access_token;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new GmailMCPError(
        "GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET are required to refresh tokens",
        "AUTH_ERROR"
      );
    }

    const refreshed = await refreshAccessToken({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: creds.refresh_token,
    });

    const updated: OAuthCredentials = {
      ...creds,
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
      scope: refreshed.scope || creds.scope,
      token_type: refreshed.token_type,
    };

    this.cachedCredentials = updated;

    if (!this.config.refreshToken) {
      await this.tokenStore.save(updated);
    }

    return updated.access_token;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | string[] | undefined>;
    }
  ): Promise<T> {
    const token = await this.getAccessToken();

    let url = `${BASE_URL}${path}`;
    if (options?.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) params.append(key, item);
        } else if (value !== "") {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (options?.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const error = await response.text();
      throw new GmailMCPError(
        `Gmail API error: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as T;
  }

  async getProfile(): Promise<{
    emailAddress: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
  }> {
    return this.request("GET", "/users/me/profile");
  }

  async listMessages(params: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
    includeSpamTrash?: boolean;
  }): Promise<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    return this.request("GET", "/users/me/messages", {
      query: {
        q: params.query,
        labelIds: params.labelIds,
        maxResults: params.maxResults?.toString(),
        pageToken: params.pageToken,
        includeSpamTrash: params.includeSpamTrash ? "true" : undefined,
      },
    });
  }

  async getMessage(
    messageId: string,
    format: "minimal" | "full" | "raw" | "metadata" = "full"
  ): Promise<GmailMessage> {
    return this.request("GET", `/users/me/messages/${messageId}`, {
      query: { format },
    });
  }

  async sendMessage(params: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType?: "text" | "html";
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<GmailMessage> {
    const mime = buildMimeMessage({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      body: params.body,
      bodyType: params.bodyType,
      inReplyTo: params.inReplyTo,
      references: params.references,
    });

    const raw = encodeBase64Url(mime);
    const body: Record<string, unknown> = { raw };
    if (params.threadId) body.threadId = params.threadId;

    return this.request("POST", "/users/me/messages/send", { body });
  }

  async createDraft(params: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    bodyType?: "text" | "html";
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  }): Promise<{ id: string; message?: GmailMessage }> {
    const mime = buildMimeMessage({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      body: params.body,
      bodyType: params.bodyType,
      inReplyTo: params.inReplyTo,
      references: params.references,
    });

    const raw = encodeBase64Url(mime);
    const message: Record<string, unknown> = { raw };
    if (params.threadId) message.threadId = params.threadId;

    return this.request("POST", "/users/me/drafts", {
      body: { message },
    });
  }

  async listDrafts(params: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    drafts?: Array<{ id: string; message: { id: string; threadId: string } }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    return this.request("GET", "/users/me/drafts", {
      query: {
        q: params.query,
        maxResults: params.maxResults?.toString(),
        pageToken: params.pageToken,
      },
    });
  }

  async sendDraft(draftId: string): Promise<GmailMessage> {
    return this.request("POST", "/users/me/drafts/send", {
      body: { id: draftId },
    });
  }

  async getThread(
    threadId: string,
    format: "minimal" | "full" | "metadata" = "full"
  ): Promise<{
    id: string;
    historyId: string;
    messages: GmailMessage[];
  }> {
    return this.request("GET", `/users/me/threads/${threadId}`, {
      query: { format },
    });
  }

  async modifyMessage(params: {
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<GmailMessage> {
    return this.request("POST", `/users/me/messages/${params.messageId}/modify`, {
      body: {
        addLabelIds: params.addLabelIds,
        removeLabelIds: params.removeLabelIds,
      },
    });
  }

  async trashMessage(messageId: string): Promise<GmailMessage> {
    return this.request("POST", `/users/me/messages/${messageId}/trash`);
  }

  async listLabels(): Promise<{
    labels: Array<{
      id: string;
      name: string;
      type: string;
      messageListVisibility?: string;
      labelListVisibility?: string;
    }>;
  }> {
    return this.request("GET", "/users/me/labels");
  }

  async resolveReplyContext(messageId: string): Promise<{
    threadId: string;
    inReplyTo?: string;
    references?: string;
    subject?: string;
  }> {
    const message = await this.getMessage(messageId, "metadata");
    const headers = extractHeaders(message.payload?.headers);

    const inReplyTo = headers.messageId;
    const references = headers.references
      ? `${headers.references} ${headers.messageId || ""}`.trim()
      : headers.messageId;

    let subject = headers.subject || "";
    if (subject && !/^re:/i.test(subject)) {
      subject = `Re: ${subject}`;
    }

    return {
      threadId: message.threadId || "",
      inReplyTo,
      references,
      subject,
    };
  }

  formatMessageForLLM(message: GmailMessage): {
    id?: string;
    threadId?: string;
    labelIds?: string[];
    snippet?: string;
    headers: ReturnType<typeof extractHeaders>;
    body: { text: string; html: string };
    internalDate?: string;
  } {
    const headers = extractHeaders(message.payload?.headers);
    const body = extractBodyText(message.payload);

    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      headers,
      body,
      internalDate: message.internalDate,
    };
  }
}
