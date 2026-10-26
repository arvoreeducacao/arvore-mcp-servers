import { getContentType, normalizeMessageContent, type WAMessageContent } from "baileys";

export type MediaKind = "image" | "video" | "audio" | "voice_note" | "document" | "sticker";

export type ParsedContent = {
  body: string;
  mediaType: MediaKind | null;
  mediaMimetype: string | null;
  quotedMessageId: string | null;
};

type ContextCarrier = { contextInfo?: { stanzaId?: string | null } | null };

const IGNORED_TYPES = new Set<string>([
  "protocolMessage",
  "reactionMessage",
  "pollUpdateMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "encReactionMessage",
  "keepInChatMessage",
]);

export function parseContent(raw: WAMessageContent | null | undefined): ParsedContent | null {
  const content = normalizeMessageContent(raw);
  if (!content) return null;

  const type = getContentType(content);
  if (!type || IGNORED_TYPES.has(type)) return null;

  const node = content[type] as ContextCarrier | string | null | undefined;
  const quotedMessageId =
    node && typeof node === "object" ? (node.contextInfo?.stanzaId ?? null) : null;

  const parsed = describe(type, content);
  if (!parsed) return null;

  return { ...parsed, quotedMessageId };
}

function describe(
  type: keyof WAMessageContent,
  content: WAMessageContent
): Omit<ParsedContent, "quotedMessageId"> | null {
  const text = (body: string | null | undefined) =>
    body ? { body, mediaType: null, mediaMimetype: null } : null;

  switch (type) {
    case "conversation":
      return text(content.conversation);
    case "extendedTextMessage":
      return text(content.extendedTextMessage?.text);
    case "imageMessage":
      return media("image", content.imageMessage?.mimetype, content.imageMessage?.caption);
    case "videoMessage":
    case "ptvMessage": {
      const video = content.videoMessage ?? content.ptvMessage;
      return media("video", video?.mimetype, video?.caption);
    }
    case "audioMessage":
      return media(
        content.audioMessage?.ptt ? "voice_note" : "audio",
        content.audioMessage?.mimetype,
        null
      );
    case "documentMessage": {
      const doc = content.documentMessage;
      return media("document", doc?.mimetype, [doc?.fileName, doc?.caption].filter(Boolean).join(" — "));
    }
    case "stickerMessage":
      return media("sticker", content.stickerMessage?.mimetype, null);
    case "locationMessage": {
      const loc = content.locationMessage;
      const where = [loc?.name, loc?.address].filter(Boolean).join(", ");
      return text(`[location] ${[where, coordinates(loc)].filter(Boolean).join(" ")}`.trim());
    }
    case "liveLocationMessage":
      return text(`[live location] ${coordinates(content.liveLocationMessage)}`.trim());
    case "contactMessage":
      return text(`[contact] ${content.contactMessage?.displayName ?? ""}`.trim());
    case "contactsArrayMessage": {
      const names = (content.contactsArrayMessage?.contacts ?? [])
        .map((contact) => contact.displayName)
        .filter(Boolean);
      return text(`[contacts] ${names.join(", ")}`.trim());
    }
    case "pollCreationMessage":
    case "pollCreationMessageV2":
    case "pollCreationMessageV3": {
      const poll =
        content.pollCreationMessage ?? content.pollCreationMessageV2 ?? content.pollCreationMessageV3;
      const options = (poll?.options ?? []).map((option) => option.optionName).filter(Boolean);
      return text(`[poll] ${poll?.name ?? ""}${options.length ? `: ${options.join(" / ")}` : ""}`);
    }
    case "buttonsResponseMessage":
      return text(content.buttonsResponseMessage?.selectedDisplayText);
    case "listResponseMessage":
      return text(content.listResponseMessage?.title);
    case "templateButtonReplyMessage":
      return text(content.templateButtonReplyMessage?.selectedDisplayText);
    default:
      return null;
  }
}

function coordinates(
  loc: { degreesLatitude?: number | null; degreesLongitude?: number | null } | null | undefined
): string {
  return loc?.degreesLatitude != null && loc?.degreesLongitude != null
    ? `${loc.degreesLatitude},${loc.degreesLongitude}`
    : "";
}

function media(
  kind: MediaKind,
  mimetype: string | null | undefined,
  caption: string | null | undefined
): Omit<ParsedContent, "quotedMessageId"> {
  const label = kind === "voice_note" ? "voice note" : kind;
  return {
    body: caption ? `[${label}] ${caption}` : `[${label}]`,
    mediaType: kind,
    mediaMimetype: mimetype ?? null,
  };
}
