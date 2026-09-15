import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

type Style = { bold?: true; italic?: true; strike?: true; code?: true };
type RichTextElement = Record<string, unknown>;
type MdastNode = { type: string; value?: string; url?: string; depth?: number; ordered?: boolean; children?: MdastNode[] };

const TOKEN = /<@([UW][A-Z0-9]+)>|<#([CG][A-Z0-9]+)(?:\|[^>]*)?>|:([a-z0-9_+-]+):/gi;
const MRKDWN_PROTECTED = /```[\s\S]*?```|`[^`\n]*`|<[^<>\n]+>/g;
const MRKDWN_LINK_CHUNK = /^<([a-z][a-z0-9+.-]*:[^|>\s]+)(?:\|([^>]*))?>$/i;
const MRKDWN_BOLD = /(^|[^*\w])\*([^*\n]+)\*(?!\w)/g;
const MRKDWN_STRIKE = /(^|[^~\w])~([^~\n]+)~(?!\w)/g;
const MASK = "\u0000";

export function mrkdwnToRichText(mrkdwn: string): RichTextElement[] {
  return markdownToRichText(mrkdwnToMarkdown(mrkdwn));
}

function mrkdwnToMarkdown(mrkdwn: string): string {
  const protectedChunks: string[] = [];
  const masked = mrkdwn.replace(MRKDWN_PROTECTED, (chunk) => {
    protectedChunks.push(chunk);
    return `${MASK}${protectedChunks.length - 1}${MASK}`;
  });

  const converted = masked
    .replace(MRKDWN_BOLD, "$1**$2**")
    .replace(MRKDWN_STRIKE, "$1~~$2~~");

  return converted.replace(new RegExp(`${MASK}(\\d+)${MASK}`, "g"), (match, index: string) => {
    const chunk = protectedChunks[Number(index)];
    if (chunk === undefined) return match;
    const link = MRKDWN_LINK_CHUNK.exec(chunk);
    if (!link) return chunk;
    return link[2] ? `[${link[2]}](${link[1]})` : `<${link[1]}>`;
  });
}

export function markdownToRichText(markdown: string): RichTextElement[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastNode;
  const blocks: RichTextElement[] = [];
  let pending: RichTextElement[] = [];

  const flush = (): void => {
    if (pending.length === 0) return;
    blocks.push({ type: "rich_text_section", elements: pending });
    pending = [];
  };

  for (const node of tree.children ?? []) {
    switch (node.type) {
      case "paragraph":
      case "heading": {
        if (pending.length > 0) pending.push({ type: "text", text: "\n\n" });
        const style = node.type === "heading" ? { bold: true as const } : {};
        pending.push(...inline(node.children ?? [], style));
        break;
      }
      case "blockquote": {
        flush();
        const elements: RichTextElement[] = [];
        for (const child of node.children ?? []) {
          if (elements.length > 0) elements.push({ type: "text", text: "\n" });
          elements.push(...inline(child.children ?? [], {}));
        }
        blocks.push({ type: "rich_text_quote", elements });
        break;
      }
      case "code": {
        flush();
        blocks.push({
          type: "rich_text_preformatted",
          elements: [{ type: "text", text: node.value ?? "" }],
        });
        break;
      }
      case "list": {
        flush();
        blocks.push(...list(node, 0));
        break;
      }
      default:
        break;
    }
  }

  flush();
  return blocks.length > 0 ? [{ type: "rich_text", elements: blocks }] : [];
}

function list(node: MdastNode, indent: number): RichTextElement[] {
  const sections: RichTextElement[] = [];
  const nested: RichTextElement[] = [];

  for (const item of node.children ?? []) {
    const elements: RichTextElement[] = [];
    for (const child of item.children ?? []) {
      if (child.type === "list") {
        nested.push(...list(child, indent + 1));
        continue;
      }
      if (elements.length > 0) elements.push({ type: "text", text: "\n" });
      elements.push(...inline(child.children ?? [], {}));
    }
    sections.push({ type: "rich_text_section", elements });
  }

  const block: RichTextElement = {
    type: "rich_text_list",
    style: node.ordered ? "ordered" : "bullet",
    indent,
    elements: sections,
  };

  return [block, ...nested];
}

function inline(nodes: MdastNode[], style: Style): RichTextElement[] {
  const elements: RichTextElement[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "text":
        elements.push(...tokenize(node.value ?? "", style));
        break;
      case "strong":
        elements.push(...inline(node.children ?? [], { ...style, bold: true }));
        break;
      case "emphasis":
        elements.push(...inline(node.children ?? [], { ...style, italic: true }));
        break;
      case "delete":
        elements.push(...inline(node.children ?? [], { ...style, strike: true }));
        break;
      case "inlineCode":
        elements.push(text(node.value ?? "", { ...style, code: true }));
        break;
      case "link": {
        const label = plainText(node.children ?? []);
        const link: RichTextElement = { type: "link", url: node.url ?? "" };
        if (label && label !== node.url) link.text = label;
        if (Object.keys(style).length > 0) link.style = style;
        elements.push(link);
        break;
      }
      case "break":
        elements.push({ type: "text", text: "\n" });
        break;
      default:
        if (node.children) elements.push(...inline(node.children, style));
        else if (node.value) elements.push(...tokenize(node.value, style));
        break;
    }
  }

  return elements;
}

function tokenize(value: string, style: Style): RichTextElement[] {
  const elements: RichTextElement[] = [];
  let cursor = 0;

  for (const match of value.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) elements.push(text(value.slice(cursor, start), style));

    const [, userId, channelId, emoji] = match;
    if (userId) elements.push({ type: "user", user_id: userId });
    else if (channelId) elements.push({ type: "channel", channel_id: channelId });
    else if (emoji) elements.push({ type: "emoji", name: emoji });

    cursor = start + match[0].length;
  }

  if (cursor < value.length) elements.push(text(value.slice(cursor), style));
  return elements;
}

function text(value: string, style: Style): RichTextElement {
  const element: RichTextElement = { type: "text", text: value };
  if (Object.keys(style).length > 0) element.style = style;
  return element;
}

function plainText(nodes: MdastNode[]): string {
  return nodes
    .map((node) => (node.children ? plainText(node.children) : node.value ?? ""))
    .join("");
}
