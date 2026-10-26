import Database from "better-sqlite3";
import { getDatabasePath } from "./paths.js";

export type Direction = "in" | "out";

export type StoredMessage = {
  id: string;
  jid: string;
  senderJid: string | null;
  direction: Direction;
  body: string;
  mediaType: string | null;
  mediaMimetype: string | null;
  mediaPath: string | null;
  pushName: string | null;
  quotedMessageId: string | null;
  timestamp: number;
  raw?: string | null;
};

export type MessageView = {
  id: string;
  chat: string;
  chatName: string | null;
  sender: string | null;
  senderName: string | null;
  direction: Direction;
  body: string;
  mediaType: string | null;
  mediaMimetype: string | null;
  mediaPath: string | null;
  quotedMessageId: string | null;
  timestamp: number;
  at: string;
  editedAt: string | null;
  deleted: boolean;
};

export type ChatView = {
  jid: string;
  name: string | null;
  isGroup: boolean;
  lastMessageBody: string | null;
  lastMessageDirection: Direction | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export type StoredContact = {
  jid: string;
  name: string | null;
  pushName: string | null;
  phone: string | null;
  lid: string | null;
};

export type SaveMessageOptions = {
  historical?: boolean;
};

export type MessageFilters = {
  query?: string;
  jid?: string;
  senderJids?: string[];
  direction?: Direction;
  after?: number;
  before?: number;
  limit: number;
  offset: number;
};

export type ChatFilters = {
  limit: number;
  offset: number;
  onlyUnread?: boolean;
  onlyGroups?: boolean;
  query?: string;
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

  CREATE TABLE IF NOT EXISTS lid_mappings (
    lid TEXT PRIMARY KEY,
    pn TEXT NOT NULL
  );
`;

const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ["messages", "sender_jid", "TEXT"],
  ["messages", "raw", "TEXT"],
  ["messages", "edited_at", "INTEGER"],
  ["messages", "deleted_at", "INTEGER"],
  ["chats", "name", "TEXT"],
  ["chats", "is_group", "INTEGER NOT NULL DEFAULT 0"],
  ["contacts", "name", "TEXT"],
];

const POST_MIGRATION = `
  CREATE INDEX IF NOT EXISTS idx_messages_sender_ts ON messages(sender_jid, timestamp DESC);
  UPDATE chats SET is_group = 1 WHERE jid LIKE '%@g.us' AND is_group = 0;
`;

const MESSAGE_SELECT = `
  SELECT m.*,
    CASE WHEN c.is_group = 1 THEN c.name
         ELSE COALESCE(c.name, cc.name, cc.push_name, c.push_name) END AS chat_name,
    CASE WHEN m.direction = 'out' THEN NULL
         ELSE COALESCE(s.name, s.push_name, m.push_name) END AS sender_name
  FROM messages m
  LEFT JOIN chats c ON c.jid = m.jid
  LEFT JOIN contacts cc ON cc.jid = m.jid
  LEFT JOIN contacts s ON s.jid = m.sender_jid
`;

const CHAT_SELECT = `
  SELECT * FROM (
    SELECT c.*,
      CASE WHEN c.is_group = 1 THEN c.name
           ELSE COALESCE(c.name, ct.name, ct.push_name, c.push_name) END AS display_name
    FROM chats c
    LEFT JOIN contacts ct ON ct.jid = c.jid
  )
`;

export class MessageStore {
  private readonly db: Database.Database;

  constructor(root?: string) {
    this.db = new Database(getDatabasePath(root));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.function("fold", { deterministic: true }, (value: unknown) =>
      typeof value === "string" ? fold(value) : null
    );
    this.db.exec(SCHEMA);
    this.addMissingColumns();
    this.db.exec(POST_MIGRATION);
  }

  private addMissingColumns(): void {
    for (const [table, column, definition] of ADDED_COLUMNS) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (columns.some((existing) => existing.name === column)) continue;
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  saveMessage(msg: StoredMessage, opts: SaveMessageOptions = {}): void {
    const row = { ...msg, raw: msg.raw ?? null };
    const inserted = this.db
      .prepare(
        `INSERT INTO messages
         (id, jid, sender_jid, direction, body, media_type, media_mimetype, media_path, push_name, quoted_message_id, timestamp, raw)
         VALUES (@id, @jid, @senderJid, @direction, @body, @mediaType, @mediaMimetype, @mediaPath, @pushName, @quotedMessageId, @timestamp, @raw)
         ON CONFLICT(id) DO NOTHING`
      )
      .run(row);

    if (inserted.changes === 0) {
      this.db
        .prepare(
          `UPDATE messages SET
             raw = COALESCE(@raw, raw),
             sender_jid = COALESCE(sender_jid, @senderJid),
             push_name = COALESCE(push_name, @pushName)
           WHERE id = @id`
        )
        .run(row);
      return;
    }

    this.upsertChat(msg, opts.historical === true);
  }

  oldestMessage(jid: string): MessageView | null {
    const row = this.db
      .prepare(`${MESSAGE_SELECT} WHERE m.jid = ? ORDER BY m.timestamp ASC, m.id ASC LIMIT 1`)
      .get(jid) as Record<string, unknown> | undefined;
    return row ? rowToMessage(row) : null;
  }

  findMessage(id: string): MessageView | null {
    const row = this.db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToMessage(row) : null;
  }

  findRaw(id: string): string | null {
    const row = this.db.prepare("SELECT raw FROM messages WHERE id = ?").get(id) as
      | { raw: string | null }
      | undefined;
    return row?.raw ?? null;
  }

  setMediaPath(id: string, path: string): void {
    this.db.prepare("UPDATE messages SET media_path = ? WHERE id = ?").run(path, id);
  }

  editMessage(id: string, body: string, editedAt: number): void {
    this.db
      .prepare("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?")
      .run(body, editedAt, id);
  }

  markDeleted(id: string, deletedAt: number): void {
    this.db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").run(deletedAt, id);
  }

  listMessages(jid: string, limit: number, beforeTimestamp?: number): MessageView[] {
    const params: Array<string | number> = [jid];
    let where = "WHERE m.jid = ?";
    if (beforeTimestamp) {
      where += " AND m.timestamp < ?";
      params.push(beforeTimestamp);
    }
    params.push(limit);

    const rows = this.db
      .prepare(`${MESSAGE_SELECT} ${where} ORDER BY m.timestamp DESC LIMIT ?`)
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage).reverse();
  }

  searchMessages(filters: MessageFilters): MessageView[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.query) {
      clauses.push("fold(m.body) LIKE ?");
      params.push(`%${fold(filters.query)}%`);
    }
    if (filters.jid) {
      clauses.push("m.jid = ?");
      params.push(filters.jid);
    }
    if (filters.senderJids?.length) {
      clauses.push(`m.sender_jid IN (${filters.senderJids.map(() => "?").join(", ")})`);
      params.push(...filters.senderJids);
    }
    if (filters.direction) {
      clauses.push("m.direction = ?");
      params.push(filters.direction);
    }
    if (filters.after !== undefined) {
      clauses.push("m.timestamp >= ?");
      params.push(filters.after);
    }
    if (filters.before !== undefined) {
      clauses.push("m.timestamp < ?");
      params.push(filters.before);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`${MESSAGE_SELECT} ${where} ORDER BY m.timestamp DESC LIMIT ? OFFSET ?`)
      .all(...params, filters.limit, filters.offset) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  messageContext(
    target: MessageView,
    before: number,
    after: number
  ): { before: MessageView[]; after: MessageView[] } {
    const older = before
      ? (this.db
          .prepare(
            `${MESSAGE_SELECT} WHERE m.jid = ? AND m.id <> ? AND m.timestamp <= ?
             ORDER BY m.timestamp DESC LIMIT ?`
          )
          .all(target.chat, target.id, target.timestamp, before) as Array<Record<string, unknown>>)
      : [];
    const newer = after
      ? (this.db
          .prepare(
            `${MESSAGE_SELECT} WHERE m.jid = ? AND m.timestamp > ?
             ORDER BY m.timestamp ASC LIMIT ?`
          )
          .all(target.chat, target.timestamp, after) as Array<Record<string, unknown>>)
      : [];
    return { before: older.map(rowToMessage).reverse(), after: newer.map(rowToMessage) };
  }

  listChats(filters: ChatFilters): ChatView[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filters.onlyUnread) clauses.push("unread_count > 0");
    if (filters.onlyGroups) clauses.push("is_group = 1");
    if (filters.query) {
      clauses.push("(fold(display_name) LIKE ? OR jid LIKE ?)");
      params.push(`%${fold(filters.query)}%`, `%${filters.query}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `${CHAT_SELECT} ${where} ORDER BY COALESCE(last_message_at, 0) DESC LIMIT ? OFFSET ?`
      )
      .all(...params, filters.limit, filters.offset) as Array<Record<string, unknown>>;
    return rows.map(rowToChat);
  }

  findChat(jid: string): ChatView | null {
    const row = this.db.prepare(`${CHAT_SELECT} WHERE jid = ?`).get(jid) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToChat(row) : null;
  }

  markChatRead(jid: string): void {
    this.db.prepare("UPDATE chats SET unread_count = 0 WHERE jid = ?").run(jid);
  }

  setChatName(jid: string, name: string, isGroup: boolean): void {
    this.db
      .prepare(
        `INSERT INTO chats (jid, name, is_group, unread_count) VALUES (?, ?, ?, 0)
         ON CONFLICT(jid) DO UPDATE SET name = excluded.name, is_group = excluded.is_group`
      )
      .run(jid, name, isGroup ? 1 : 0);
  }

  upsertContact(args: {
    jid: string;
    name?: string | null;
    pushName?: string | null;
    phone?: string | null;
    lid?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO contacts (jid, name, push_name, phone, lid, updated_at)
         VALUES (@jid, @name, @pushName, @phone, @lid, @updatedAt)
         ON CONFLICT(jid) DO UPDATE SET
           name = COALESCE(excluded.name, contacts.name),
           push_name = COALESCE(excluded.push_name, contacts.push_name),
           phone = COALESCE(excluded.phone, contacts.phone),
           lid = COALESCE(excluded.lid, contacts.lid),
           updated_at = excluded.updated_at`
      )
      .run({
        jid: args.jid,
        name: args.name ?? null,
        pushName: args.pushName ?? null,
        phone: args.phone ?? null,
        lid: args.lid ?? null,
        updatedAt: Math.floor(Date.now() / 1000),
      });
  }

  searchContacts(query: string, limit: number): StoredContact[] {
    const folded = `%${fold(query)}%`;
    const digits = query.replace(/\D/g, "");
    const rows = this.db
      .prepare(
        `SELECT jid, name, push_name, phone, lid FROM contacts
         WHERE fold(name) LIKE ? OR fold(push_name) LIKE ? OR jid LIKE ?
            OR (? <> '' AND (phone LIKE ? OR lid LIKE ?))
         ORDER BY (name IS NOT NULL) DESC, updated_at DESC
         LIMIT ?`
      )
      .all(folded, folded, `%${query}%`, digits, `%${digits}%`, `%${digits}%`, limit) as Array<
      Record<string, unknown>
    >;
    return rows.map((row) => ({
      jid: String(row.jid),
      name: (row.name as string | null) ?? null,
      pushName: (row.push_name as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      lid: (row.lid as string | null) ?? null,
    }));
  }

  contactName(jid: string): string | null {
    const row = this.db
      .prepare("SELECT COALESCE(name, push_name) AS display FROM contacts WHERE jid = ?")
      .get(jid) as { display: string | null } | undefined;
    return row?.display ?? null;
  }

  pnForLid(lid: string): string | null {
    const row = this.db.prepare("SELECT pn FROM lid_mappings WHERE lid = ?").get(lid) as
      | { pn: string }
      | undefined;
    return row?.pn ?? null;
  }

  saveLidMapping(lid: string, pn: string): void {
    const learned = this.db
      .prepare(
        `INSERT INTO lid_mappings (lid, pn) VALUES (?, ?)
         ON CONFLICT(lid) DO UPDATE SET pn = excluded.pn WHERE lid_mappings.pn <> excluded.pn`
      )
      .run(lid, pn);
    if (learned.changes === 0) return;
    this.mergeLidIntoPn(lid, pn);
  }

  private mergeLidIntoPn(lid: string, pn: string): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE messages SET jid = ? WHERE jid = ?").run(pn, lid);
      this.db.prepare("UPDATE messages SET sender_jid = ? WHERE sender_jid = ?").run(pn, lid);
      this.db
        .prepare(
          `INSERT INTO chats (jid, push_name, name, is_group, last_message_body, last_message_direction, last_message_at, unread_count)
           SELECT @pn, push_name, name, is_group, last_message_body, last_message_direction, last_message_at, unread_count
           FROM chats WHERE jid = @lid
           ON CONFLICT(jid) DO UPDATE SET
             push_name = COALESCE(chats.push_name, excluded.push_name),
             name = COALESCE(chats.name, excluded.name),
             last_message_body = CASE WHEN COALESCE(excluded.last_message_at, 0) > COALESCE(chats.last_message_at, 0)
               THEN excluded.last_message_body ELSE chats.last_message_body END,
             last_message_direction = CASE WHEN COALESCE(excluded.last_message_at, 0) > COALESCE(chats.last_message_at, 0)
               THEN excluded.last_message_direction ELSE chats.last_message_direction END,
             last_message_at = MAX(COALESCE(excluded.last_message_at, 0), COALESCE(chats.last_message_at, 0)),
             unread_count = chats.unread_count + excluded.unread_count`
        )
        .run({ lid, pn });
      this.db.prepare("DELETE FROM chats WHERE jid = ?").run(lid);

      const legacy = this.db.prepare("SELECT * FROM contacts WHERE jid = ?").get(lid) as
        | Record<string, unknown>
        | undefined;
      this.upsertContact({
        jid: pn,
        name: (legacy?.name as string | null) ?? null,
        pushName: (legacy?.push_name as string | null) ?? null,
        phone: pn.split("@")[0],
        lid: lid.split("@")[0],
      });
      if (legacy) this.db.prepare("DELETE FROM contacts WHERE jid = ?").run(lid);
    })();
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      return;
    }
  }

  private upsertChat(msg: StoredMessage, historical: boolean): void {
    const isGroup = msg.jid.endsWith("@g.us");
    this.db
      .prepare(
        `INSERT INTO chats (jid, push_name, is_group, last_message_body, last_message_direction, last_message_at, unread_count)
         VALUES (@jid, @pushName, @isGroup, @body, @direction, @timestamp, @unread)
         ON CONFLICT(jid) DO UPDATE SET
           push_name = CASE
             WHEN excluded.last_message_at >= COALESCE(chats.last_message_at, 0)
               THEN COALESCE(excluded.push_name, chats.push_name)
             ELSE chats.push_name
           END,
           last_message_body = CASE
             WHEN excluded.last_message_at >= COALESCE(chats.last_message_at, 0)
               THEN excluded.last_message_body
             ELSE chats.last_message_body
           END,
           last_message_direction = CASE
             WHEN excluded.last_message_at >= COALESCE(chats.last_message_at, 0)
               THEN excluded.last_message_direction
             ELSE chats.last_message_direction
           END,
           last_message_at = MAX(excluded.last_message_at, COALESCE(chats.last_message_at, 0)),
           unread_count = chats.unread_count + excluded.unread_count`
      )
      .run({
        jid: msg.jid,
        pushName: !isGroup && msg.direction === "in" ? msg.pushName : null,
        isGroup: isGroup ? 1 : 0,
        body: truncate(msg.body, 200),
        direction: msg.direction,
        timestamp: msg.timestamp,
        unread: !historical && msg.direction === "in" ? 1 : 0,
      });
  }
}

export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function rowToMessage(row: Record<string, unknown>): MessageView {
  const timestamp = Number(row.timestamp);
  return {
    id: String(row.id),
    chat: String(row.jid),
    chatName: (row.chat_name as string | null) ?? null,
    sender: (row.sender_jid as string | null) ?? null,
    senderName: (row.sender_name as string | null) ?? null,
    direction: row.direction as Direction,
    body: String(row.body ?? ""),
    mediaType: (row.media_type as string | null) ?? null,
    mediaMimetype: (row.media_mimetype as string | null) ?? null,
    mediaPath: (row.media_path as string | null) ?? null,
    quotedMessageId: (row.quoted_message_id as string | null) ?? null,
    timestamp,
    at: toIso(timestamp),
    editedAt: row.edited_at ? toIso(Number(row.edited_at)) : null,
    deleted: row.deleted_at != null,
  };
}

function rowToChat(row: Record<string, unknown>): ChatView {
  return {
    jid: String(row.jid),
    name: (row.display_name as string | null) ?? null,
    isGroup: Number(row.is_group) === 1,
    lastMessageBody: (row.last_message_body as string | null) ?? null,
    lastMessageDirection: (row.last_message_direction as Direction | null) ?? null,
    lastMessageAt: row.last_message_at ? toIso(Number(row.last_message_at)) : null,
    unreadCount: Number(row.unread_count ?? 0),
  };
}

function toIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
