import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageStore, type StoredMessage } from "./db.js";

const ANA = "5511987654321@s.whatsapp.net";
const ANA_LID = "123456789@lid";
const GROUP = "120363000000000000@g.us";

function message(overrides: Partial<StoredMessage>): StoredMessage {
  return {
    id: "m1",
    jid: ANA,
    senderJid: ANA,
    direction: "in",
    body: "oi",
    mediaType: null,
    mediaMimetype: null,
    mediaPath: null,
    pushName: "Ana",
    quotedMessageId: null,
    timestamp: 1_760_000_000,
    ...overrides,
  };
}

describe("MessageStore", () => {
  let root: string;
  let store: MessageStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "whatsapp-mcp-"));
    store = new MessageStore(root);
  });

  afterEach(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("leaves the unread counter to WhatsApp instead of counting stored messages", () => {
    store.saveMessage(message({}));
    store.saveMessage(message({ id: "m2" }));
    expect(store.listChats({ limit: 10, offset: 0 })[0].unreadCount).toBe(0);

    store.setUnread(ANA, 4);
    store.addUnread(ANA, 1);
    expect(store.findChat(ANA)?.unreadCount).toBe(5);

    store.setUnread(ANA, 0);
    store.markChatUnread(ANA);
    expect(store.findChat(ANA)?.unreadCount).toBe(1);
  });

  it("names a group by its subject, not by whoever spoke last", () => {
    store.setChatName(GROUP, "Pais do 5º ano", true);
    store.saveMessage(message({ id: "g1", jid: GROUP, pushName: "Bruno", senderJid: "5511900000000@s.whatsapp.net" }));

    const [chat] = store.listChats({ limit: 10, offset: 0, onlyGroups: true });
    expect(chat).toMatchObject({ jid: GROUP, name: "Pais do 5º ano", isGroup: true });
    expect(store.findMessage("g1")?.senderName).toBe("Bruno");
  });

  it("prefers the saved contact name over the push name", () => {
    store.saveMessage(message({}));
    store.upsertContact({ jid: ANA, name: "Ana (Escola Sol)", pushName: "Ana" });
    expect(store.listChats({ limit: 10, offset: 0, query: "escola sol" })[0].name).toBe("Ana (Escola Sol)");
  });

  it("searches ignoring accents and case, with chat, sender and time filters", () => {
    store.saveMessage(message({ id: "a", body: "A reunião é amanhã", timestamp: 100 }));
    store.saveMessage(message({ id: "b", body: "Reuniao cancelada", timestamp: 200 }));
    store.saveMessage(message({ id: "c", jid: GROUP, senderJid: "5511900000000@s.whatsapp.net", body: "reunião?", timestamp: 300 }));

    const byText = store.searchMessages({ query: "REUNIÃO", limit: 10, offset: 0 });
    expect(byText.map((m) => m.id)).toEqual(["c", "b", "a"]);

    const inChat = store.searchMessages({ query: "reuniao", jid: ANA, after: 150, limit: 10, offset: 0 });
    expect(inChat.map((m) => m.id)).toEqual(["b"]);

    const bySender = store.searchMessages({ senderJids: [ANA], limit: 10, offset: 0 });
    expect(bySender.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("returns the messages around a message", () => {
    for (let i = 1; i <= 5; i++) store.saveMessage(message({ id: `m${i}`, body: `msg ${i}`, timestamp: i }));
    const target = store.findMessage("m3")!;
    const around = store.messageContext(target, 1, 2);
    expect(around.before.map((m) => m.id)).toEqual(["m2"]);
    expect(around.after.map((m) => m.id)).toEqual(["m4", "m5"]);
  });

  it("applies edits and deletions", () => {
    store.saveMessage(message({}));
    store.editMessage("m1", "oi, tudo bem?", 1_760_000_100);
    store.markDeleted("m1", 1_760_000_200);
    expect(store.findMessage("m1")).toMatchObject({ body: "oi, tudo bem?", deleted: true });
    expect(store.findMessage("m1")?.editedAt).not.toBeNull();
  });

  it("merges a LID chat into the phone chat once the mapping is learned", () => {
    store.saveMessage(message({ id: "old", jid: ANA, timestamp: 100 }));
    store.saveMessage(message({ id: "new", jid: ANA_LID, senderJid: ANA_LID, timestamp: 200 }));
    store.addUnread(ANA_LID, 1);
    store.upsertContact({ jid: ANA_LID, pushName: "Ana" });

    store.saveLidMapping(ANA_LID, ANA);

    const chats = store.listChats({ limit: 10, offset: 0 });
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ jid: ANA, unreadCount: 1, name: "Ana" });
    expect(store.listMessages(ANA, 10).map((m) => m.id)).toEqual(["old", "new"]);
    expect(store.findMessage("new")?.sender).toBe(ANA);
    expect(store.searchContacts("123456789", 5)[0]).toMatchObject({ jid: ANA, lid: "123456789" });
    expect(store.pnForLid(ANA_LID)).toBe(ANA);
  });

  it("finds contacts by name without accents or by any part of the phone", () => {
    store.upsertContact({ jid: ANA, name: "Ana Conceição", phone: "5511987654321" });
    expect(store.searchContacts("conceicao", 5)[0].jid).toBe(ANA);
    expect(store.searchContacts("98765-4321", 5)[0].jid).toBe(ANA);
  });

  it("upgrades a database created by the previous version", () => {
    store.close();
    rmSync(join(root, "messages.db"));
    const legacy = new Database(join(root, "messages.db"));
    legacy.exec(`
      CREATE TABLE messages (id TEXT PRIMARY KEY, jid TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        media_type TEXT, media_mimetype TEXT, media_path TEXT, push_name TEXT, quoted_message_id TEXT, timestamp INTEGER NOT NULL);
      CREATE TABLE chats (jid TEXT PRIMARY KEY, push_name TEXT, last_message_body TEXT, last_message_direction TEXT,
        last_message_at INTEGER, unread_count INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE contacts (jid TEXT PRIMARY KEY, push_name TEXT, phone TEXT, lid TEXT, updated_at INTEGER NOT NULL);
      INSERT INTO messages (id, jid, direction, body, timestamp) VALUES ('legacy', '${GROUP}', 'in', 'antiga', 1);
      INSERT INTO chats (jid, push_name, last_message_at) VALUES ('${GROUP}', 'Quem falou por último', 1);
    `);
    legacy.close();

    store = new MessageStore(root);
    expect(store.findMessage("legacy")).toMatchObject({ body: "antiga", sender: null, deleted: false });
    expect(store.listChats({ limit: 10, offset: 0 })[0]).toMatchObject({ isGroup: true, name: null });
  });
});
