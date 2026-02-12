import crypto from "crypto";
import {
  EmailAccount,
  EmailMessage,
  TempMailMCPError,
  type EmailStore,
  type CreateMessageData,
} from "./types.js";

export class InMemoryEmailStore implements EmailStore {
  private accounts: Map<string, EmailAccount> = new Map();
  private messages: Map<string, EmailMessage> = new Map();

  createAccount(username: string, domain: string): EmailAccount {
    const address = `${username}@${domain}`;

    for (const account of this.accounts.values()) {
      if (account.address === address) {
        throw new TempMailMCPError(
          `Account "${address}" already exists`,
          "ACCOUNT_EXISTS",
          409
        );
      }
    }

    const account: EmailAccount = {
      id: crypto.randomUUID(),
      address,
      username,
      domain,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    this.accounts.set(account.id, account);
    return account;
  }

  getAccountById(id: string): EmailAccount | null {
    return this.accounts.get(id) || null;
  }

  getAccountByAddress(address: string): EmailAccount | null {
    for (const account of this.accounts.values()) {
      if (account.address === address && account.is_active) return account;
    }
    return null;
  }

  listAccounts(
    page: number = 1,
    limit: number = 20
  ): { accounts: EmailAccount[]; total: number } {
    const active = [...this.accounts.values()].filter((a) => a.is_active);
    const offset = (page - 1) * limit;
    return {
      accounts: active.slice(offset, offset + limit),
      total: active.length,
    };
  }

  deleteAccount(id: string): void {
    if (!this.accounts.has(id)) {
      throw new TempMailMCPError(
        `Account "${id}" not found`,
        "NOT_FOUND",
        404
      );
    }
    this.accounts.delete(id);
    for (const [msgId, msg] of this.messages) {
      if (msg.account_id === id) this.messages.delete(msgId);
    }
  }

  createMessage(data: CreateMessageData): EmailMessage {
    const message: EmailMessage = {
      id: crypto.randomUUID(),
      account_id: data.accountId,
      from_address: data.fromAddress,
      from_name: data.fromName,
      to_address: data.toAddress,
      subject: data.subject,
      text: data.text,
      html: data.html,
      has_attachments: data.hasAttachments,
      size: data.size,
      seen: false,
      created_at: new Date().toISOString(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  getMessageById(id: string): EmailMessage | null {
    const msg = this.messages.get(id);
    if (!msg) return null;
    msg.seen = true;
    return { ...msg };
  }

  getInbox(
    accountId: string,
    page: number = 1,
    limit: number = 20
  ): { messages: EmailMessage[]; total: number } {
    const msgs = [...this.messages.values()].filter(
      (m) => m.account_id === accountId
    );
    const offset = (page - 1) * limit;
    return {
      messages: msgs.slice(offset, offset + limit),
      total: msgs.length,
    };
  }

  deleteMessage(id: string): void {
    if (!this.messages.has(id)) {
      throw new TempMailMCPError(
        `Message "${id}" not found`,
        "NOT_FOUND",
        404
      );
    }
    this.messages.delete(id);
  }

  close(): void {}
}
