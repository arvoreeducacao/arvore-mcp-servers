import { z } from "zod";

const recipient = z
  .string()
  .min(1)
  .describe(
    "Phone number (digits only or with formatting, BR-aware) or full JID (e.g. 5511987654321 or 5511987654321@s.whatsapp.net)"
  );

export const ConnectParamsSchema = z.object({
  waitForOpen: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, blocks until connection is open or times out"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .default(60000)
    .describe("Timeout in ms when waitForOpen=true"),
});

export const StatusParamsSchema = z.object({});

export const QrCodeParamsSchema = z.object({
  format: z
    .enum(["png", "ascii", "data_url", "raw"])
    .optional()
    .default("png")
    .describe(
      "png (default): returns the QR as an inline image the agent can render. ascii: terminal-style QR string. data_url: base64 data URL. raw: the raw QR string for custom rendering"
    ),
});

export const DisconnectParamsSchema = z.object({});

export const LogoutParamsSchema = z.object({
  confirm: z
    .literal(true)
    .describe("Must be true to confirm. This wipes auth state and requires re-pairing."),
});

export const SendTextParamsSchema = z.object({
  to: recipient,
  text: z.string().min(1).describe("Message text"),
  quotedMessageId: z
    .string()
    .optional()
    .describe("Optional message ID to quote/reply to"),
});

export const SendMediaParamsShape = {
  to: recipient,
  mediaType: z.enum(["image", "audio", "document", "video"]),
  filePath: z.string().optional().describe("Absolute path to a file on disk"),
  base64: z.string().optional().describe("Base64-encoded file content (alternative to filePath)"),
  mimetype: z.string().optional().describe("MIME type (auto-detected when filePath is given)"),
  caption: z.string().optional(),
  filename: z.string().optional().describe("Used for documents"),
  ptt: z
    .boolean()
    .optional()
    .describe(
      "For audio: send as a voice note (default true). Any format is re-encoded to Opus with ffmpeg so every phone plays it"
    ),
  quotedMessageId: z.string().optional(),
};

export const SendMediaParamsSchema = z.object(SendMediaParamsShape).refine(
  (v) => Boolean(v.filePath || v.base64),
  { message: "Either filePath or base64 must be provided" }
);

export const SendReactionParamsSchema = z.object({
  to: recipient,
  targetMessageId: z.string().min(1),
  emoji: z.string().min(1).describe("Emoji to react with. Empty string removes reaction."),
  fromMe: z
    .boolean()
    .optional()
    .describe("True if the target message was sent by you (default false)"),
});

export const MarkReadParamsSchema = z.object({
  jid: z.string().min(1),
  messageIds: z.array(z.string().min(1)).min(1),
});

const instant = z
  .union([z.string().min(1), z.number().int().nonnegative()])
  .describe(
    "ISO 8601 date or date-time (e.g. 2026-10-25 or 2026-10-25T14:00:00-03:00; no offset means UTC) or unix seconds"
  );

export const ListChatsParamsSchema = z.object({
  limit: z.number().int().positive().max(200).optional().default(50),
  offset: z.number().int().nonnegative().optional().default(0),
  onlyUnread: z.boolean().optional().default(false),
  onlyGroups: z.boolean().optional().default(false),
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by chat or group name (accent and case insensitive) or by JID"),
});

export const GetMessagesParamsSchema = z.object({
  jid: z.string().min(1).describe("JID of the chat (e.g. 5511987654321@s.whatsapp.net)"),
  limit: z.number().int().positive().max(500).optional().default(50),
  beforeTimestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Only return messages older than this unix timestamp"),
});

export const FetchHistoryParamsSchema = z.object({
  jid: z.string().min(1).describe("JID of the chat to pull older messages for"),
  count: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .default(50)
    .describe("How many messages older than the oldest stored one to request"),
});

export const SearchMessagesParamsSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Text to look for in the message body (accent and case insensitive). Omit to list by the other filters"),
  jid: z.string().min(1).optional().describe("Only messages of this chat (JID from list_chats)"),
  sender: z
    .string()
    .min(1)
    .optional()
    .describe("Only messages sent by this person: phone number or JID. In groups this is the participant"),
  direction: z.enum(["in", "out"]).optional().describe("in = received, out = sent by you"),
  after: instant.optional().describe("Only messages at or after this instant"),
  before: instant.optional().describe("Only messages before this instant"),
  limit: z.number().int().positive().max(200).optional().default(30),
  offset: z.number().int().nonnegative().optional().default(0),
  context: z
    .number()
    .int()
    .nonnegative()
    .max(10)
    .optional()
    .default(0)
    .describe("How many messages of the same chat to include before and after each match"),
});

export const GetMessageContextParamsSchema = z.object({
  messageId: z.string().min(1),
  before: z.number().int().nonnegative().max(50).optional().default(5),
  after: z.number().int().nonnegative().max(50).optional().default(5),
});

export const DownloadMediaParamsSchema = z.object({
  messageId: z.string().min(1).describe("ID of a message whose mediaType is not null"),
});

export const GetGroupParamsSchema = z.object({
  jid: z.string().min(1).describe("Group JID, ending in @g.us"),
});

export const SearchContactsParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export const GetContactParamsSchema = z.object({
  contact: z
    .string()
    .min(1)
    .describe("Phone number, JID, or a name that matches exactly one contact"),
});

export const ResolveJidParamsSchema = z.object({
  input: z.string().min(1).describe("Phone number or JID to validate against WhatsApp"),
});

export const EditMessageParamsSchema = z.object({
  jid: z.string().min(1),
  messageId: z.string().min(1),
  newText: z.string().min(1),
});

export const DeleteMessageParamsSchema = z.object({
  jid: z.string().min(1),
  messageId: z.string().min(1),
  fromMe: z.boolean().optional().default(true),
});
