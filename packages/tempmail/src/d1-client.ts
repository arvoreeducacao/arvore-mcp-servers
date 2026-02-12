import crypto from "crypto";
import { simpleParser } from "mailparser";
import {
  EmailAccount,
  EmailMessage,
  TempMailMCPError,
  type EmailStore,
  type CreateMessageData,
} from "./types.js";

interface D1QueryResult<T> {
  results: T[];
  success: boolean;
  meta: { changes: number; duration: number };
}

interface D1ApiResponse<T> {
  result: D1QueryResult<T>[];
  success: boolean;
  errors: Array<{ message: string }>;
}

export interface D1ClientConfig {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export class D1DatabaseClient implements EmailStore {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(private config: D1ClientConfig) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
    this.headers = {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  private async query<T>(
    sql: string,
    params: unknown[] = [],
  ): Promise<D1QueryResult<T>> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new TempMailMCPError(
        `D1 API error (${response.status}): ${text}`,
        "D1_API_ERROR",
        response.status,
      );
    }

    const data = (await response.json()) as D1ApiResponse<T>;

    if (!data.success) {
      const msg = data.errors?.[0]?.message || "Unknown D1 error";
      throw new TempMailMCPError(msg, "D1_QUERY_ERROR");
    }

    return data.result[0];
  }

  async createAccount(username: string, domain: string): Promise<EmailAccount> {
    const id = crypto.randomUUID();
    const address = `${username}@${domain}`;

    const existing = await this.query<{ id: string }>(
      "SELECT id FROM accounts WHERE address = ?",
      [address],
    );

    if (existing.results.length > 0) {
      throw new TempMailMCPError(
        `Account "${address}" already exists`,
        "ACCOUNT_EXISTS",
        409,
      );
    }

    await this.query(
      "INSERT INTO accounts (id, address, username, domain) VALUES (?, ?, ?, ?)",
      [id, address, username, domain],
    );

    const account = await this.getAccountById(id);
    return account!;
  }

  async getAccountById(id: string): Promise<EmailAccount | null> {
    const result = await this.query<EmailAccount>(
      "SELECT * FROM accounts WHERE id = ?",
      [id],
    );

    if (result.results.length === 0) return null;

    return {
      ...result.results[0],
      is_active: Boolean(result.results[0].is_active),
    };
  }

  async getAccountByAddress(address: string): Promise<EmailAccount | null> {
    const result = await this.query<EmailAccount>(
      "SELECT * FROM accounts WHERE address = ? AND is_active = 1",
      [address],
    );

    if (result.results.length === 0) return null;

    return {
      ...result.results[0],
      is_active: Boolean(result.results[0].is_active),
    };
  }

  async listAccounts(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ accounts: EmailAccount[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM accounts WHERE is_active = 1",
    );

    const result = await this.query<EmailAccount>(
      "SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset],
    );

    return {
      accounts: result.results.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
      })),
      total: countResult.results[0].count,
    };
  }

  async deleteAccount(id: string): Promise<void> {
    await this.query("DELETE FROM messages WHERE account_id = ?", [id]);

    const result = await this.query("DELETE FROM accounts WHERE id = ?", [id]);

    if (result.meta.changes === 0) {
      throw new TempMailMCPError(`Account "${id}" not found`, "NOT_FOUND", 404);
    }
  }

  async createMessage(data: CreateMessageData): Promise<EmailMessage> {
    const id = crypto.randomUUID();

    await this.query(
      `INSERT INTO messages (id, account_id, from_address, from_name, to_address, subject, text, html, has_attachments, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.accountId,
        data.fromAddress,
        data.fromName,
        data.toAddress,
        data.subject,
        data.text,
        data.html,
        data.hasAttachments ? 1 : 0,
        data.size,
      ],
    );

    const message = await this.getMessageById(id);
    return message!;
  }

  async getMessageById(id: string): Promise<EmailMessage | null> {
    const result = await this.query<EmailMessage & { raw?: string }>(
      "SELECT * FROM messages WHERE id = ?",
      [id],
    );

    if (result.results.length === 0) return null;

    await this.query("UPDATE messages SET seen = 1 WHERE id = ?", [id]);

    const row = result.results[0];

    if (row.raw && !row.text && !row.html) {
      const parsed = await simpleParser(row.raw);
      return {
        ...row,
        from_address: parsed.from?.value?.[0]?.address || row.from_address,
        from_name: parsed.from?.value?.[0]?.name || row.from_name,
        subject: parsed.subject || row.subject,
        text: parsed.text || "",
        html:
          typeof parsed.html === "string"
            ? parsed.html
            : parsed.textAsHtml || "",
        has_attachments: Boolean(
          row.has_attachments || (parsed.attachments?.length || 0) > 0,
        ),
        seen: true,
      };
    }

    return {
      ...row,
      has_attachments: Boolean(row.has_attachments),
      seen: true,
    };
  }

  async getInbox(
    accountId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ messages: EmailMessage[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await this.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM messages WHERE account_id = ?",
      [accountId],
    );

    const result = await this.query<EmailMessage>(
      "SELECT id, account_id, from_address, from_name, to_address, subject, text, has_attachments, size, seen, created_at FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [accountId, limit, offset],
    );

    return {
      messages: result.results.map((row) => ({
        ...row,
        html: "",
        has_attachments: Boolean(row.has_attachments),
        seen: Boolean(row.seen),
      })),
      total: countResult.results[0].count,
    };
  }

  async deleteMessage(id: string): Promise<void> {
    const result = await this.query("DELETE FROM messages WHERE id = ?", [id]);

    if (result.meta.changes === 0) {
      throw new TempMailMCPError(`Message "${id}" not found`, "NOT_FOUND", 404);
    }
  }

  close(): void {}
}
