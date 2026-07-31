import Database from "better-sqlite3";
import { getDatabasePath } from "./paths.js";

export type Direction = "in" | "out";

export type StoredMessage = {
  id: string;
  jid: string;
  direction: Direction;
  body: string;
  mediaType: string | null;
  mediaMimetype: string | null;
  mediaPath: string | null;
  pushName: string | null;
  quotedMessageId: string | null;
  timestamp: number;
};

export type StoredChat = {
  jid: string;
  pushName: string | null;
  lastMessageBody: string | null;
  lastMessageDirection: Direction | null;
  lastMessageAt: number | null;
  unreadCount: number;
};

export type StoredContact = {
  jid: string;
  pushName: string | null;
  phone: string | null;
  lid: string | null;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    jid TEXT NOT NULL,
    direction TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    media_type TEXT,
    media_mimetype TEXT,
    media_path TEXT,
    push_name TEXT,
    quoted_message_id TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_jid_ts ON messages(jid, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp DESC);

  CREATE TABLE IF NOT EXISTS chats (
    jid TEXT PRIMARY KEY,
    push_name TEXT,
    last_message_body TEXT,
    last_message_direction TEXT,
    last_message_at INTEGER,
    unread_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_chats_last_at ON chats(last_message_at DESC);

  CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    push_name TEXT,
    phone TEXT,
    lid TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
  CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(lid);
  CREATE INDEX IF NOT EXISTS idx_contacts_push_name ON contacts(push_name);
`;

export class MessageStore {
  private readonly db: Database.Database;

  constructor(root?: string) {
    this.db = new Database(getDatabasePath(root));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  saveMessage(msg: StoredMessage): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO messages
         (id, jid, direction, body, media_type, media_mimetype, media_path, push_name, quoted_message_id, timestamp)
         VALUES (@id, @jid, @direction, @body, @mediaType, @mediaMimetype, @mediaPath, @pushName, @quotedMessageId, @timestamp)`
      )
      .run(msg);

    this.upsertChat(msg);
  }

  findMessage(id: string): StoredMessage | null {
    const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return rowToMessage(row);
  }

  listMessages(jid: string, limit: number, beforeTimestamp?: number): StoredMessage[] {
    const params: Array<string | number> = [jid];
    let where = "WHERE jid = ?";
    if (beforeTimestamp) {
      where += " AND timestamp < ?";
      params.push(beforeTimestamp);
    }
    params.push(limit);

    const rows = this.db
      .prepare(`SELECT * FROM messages ${where} ORDER BY timestamp DESC LIMIT ?`)
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage).reverse();
  }

  searchMessages(query: string, limit: number): StoredMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE body LIKE ? ORDER BY timestamp DESC LIMIT ?")
      .all(`%${query}%`, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  listChats(limit: number, offset: number, onlyUnread: boolean): StoredChat[] {
    const where = onlyUnread ? "WHERE unread_count > 0" : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM chats ${where} ORDER BY COALESCE(last_message_at, 0) DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as Array<Record<string, unknown>>;
    return rows.map(rowToChat);
  }

  markChatRead(jid: string): void {
    this.db.prepare("UPDATE chats SET unread_count = 0 WHERE jid = ?").run(jid);
  }

  upsertContact(args: {
    jid: string;
    pushName?: string | null;
    phone?: string | null;
    lid?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO contacts (jid, push_name, phone, lid, updated_at)
         VALUES (@jid, @pushName, @phone, @lid, @updatedAt)
         ON CONFLICT(jid) DO UPDATE SET
           push_name = COALESCE(excluded.push_name, contacts.push_name),
           phone = COALESCE(excluded.phone, contacts.phone),
           lid = COALESCE(excluded.lid, contacts.lid),
           updated_at = excluded.updated_at`
      )
      .run({
        jid: args.jid,
        pushName: args.pushName ?? null,
        phone: args.phone ?? null,
        lid: args.lid ?? null,
        updatedAt: Math.floor(Date.now() / 1000),
      });
  }

  searchContacts(query: string, limit: number): StoredContact[] {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT jid, push_name, phone, lid FROM contacts
         WHERE push_name LIKE ? OR phone LIKE ? OR jid LIKE ? OR lid LIKE ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(like, like, like, like, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      jid: String(row.jid),
      pushName: (row.push_name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      lid: (row.lid as string | null) ?? null,
    }));
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      return;
    }
  }

  private upsertChat(msg: StoredMessage): void {
    this.db
      .prepare(
        `INSERT INTO chats (jid, push_name, last_message_body, last_message_direction, last_message_at, unread_count)
         VALUES (@jid, @pushName, @body, @direction, @timestamp, @unread)
         ON CONFLICT(jid) DO UPDATE SET
           push_name = COALESCE(excluded.push_name, chats.push_name),
           last_message_body = excluded.last_message_body,
           last_message_direction = excluded.last_message_direction,
           last_message_at = excluded.last_message_at,
           unread_count = chats.unread_count + excluded.unread_count`
      )
      .run({
        jid: msg.jid,
        pushName: msg.pushName,
        body: truncate(msg.body, 200),
        direction: msg.direction,
        timestamp: msg.timestamp,
        unread: msg.direction === "in" ? 1 : 0,
      });
  }
}

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id),
    jid: String(row.jid),
    direction: row.direction as Direction,
    body: String(row.body ?? ""),
    mediaType: (row.media_type as string | null) ?? null,
    mediaMimetype: (row.media_mimetype as string | null) ?? null,
    mediaPath: (row.media_path as string | null) ?? null,
    pushName: (row.push_name as string | null) ?? null,
    quotedMessageId: (row.quoted_message_id as string | null) ?? null,
    timestamp: Number(row.timestamp),
  };
}

function rowToChat(row: Record<string, unknown>): StoredChat {
  return {
    jid: String(row.jid),
    pushName: (row.push_name as string | null) ?? null,
    lastMessageBody: (row.last_message_body as string | null) ?? null,
    lastMessageDirection: (row.last_message_direction as Direction | null) ?? null,
    lastMessageAt: row.last_message_at ? Number(row.last_message_at) : null,
    unreadCount: Number(row.unread_count ?? 0),
  };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
