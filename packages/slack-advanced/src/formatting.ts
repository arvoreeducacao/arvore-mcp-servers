import { slackifyMarkdown } from "slackify-markdown";

export type MessageFormat = "markdown" | "mrkdwn";

type CapturedLink = { url: string; label: string | null };

const WEB_SCHEME = /^(?:https?|mailto):/i;
const PLACEHOLDER_PREFIX = "slackadvlink";
const MRKDWN_LINK = /<([a-z][a-z0-9+.-]*:[^|>\s]+)(?:\|([^>]*))?>/gi;
const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*([a-z][a-z0-9+.-]*:[^\s)]+?)\s*\)/gi;

export function resolveFormat(format?: MessageFormat, contentType?: string): MessageFormat {
  if (format) return format;
  if (contentType === "text/plain") return "mrkdwn";
  if (contentType === "text/markdown") return "markdown";
  return "markdown";
}

export function toSlackText(text: string, format: MessageFormat = "markdown"): string {
  if (format === "mrkdwn") return text;

  const links: CapturedLink[] = [];
  const placeholder = (link: CapturedLink): string => {
    links.push(link);
    return `${PLACEHOLDER_PREFIX}${links.length - 1}x`;
  };

  const protectedText = text
    .replace(MRKDWN_LINK, (_match, url: string, label?: string) =>
      placeholder({ url, label: label ?? null })
    )
    .replace(MARKDOWN_LINK, (match, label: string, url: string) =>
      WEB_SCHEME.test(url) ? match : placeholder({ url, label })
    );

  const converted = slackifyMarkdown(protectedText).replace(/\n+$/, "");

  return converted.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)x`, "g"),
    (match, index: string) => {
      const link = links[Number(index)];
      if (!link) return match;
      return link.label === null
        ? `<${escapeUrl(link.url)}>`
        : `<${escapeUrl(link.url)}|${escapeLabel(link.label)}>`;
    }
  );
}

export function extractMessageText(message: {
  text?: string;
  blocks?: Array<Record<string, unknown>>;
}): string {
  const section = message.blocks?.find(
    (block) => block.type === "section" && isMrkdwnText(block.text)
  );
  if (section) return (section.text as { text: string }).text;
  return message.text ?? "";
}

function isMrkdwnText(value: unknown): value is { type: string; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "mrkdwn" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function escapeUrl(url: string): string {
  return url.replace(/&(?!amp;)/g, "&amp;");
}

function escapeLabel(label: string): string {
  return label.replace(/&(?!amp;)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
