import { randomUUID } from "node:crypto";
import { LeafBlock } from "./markdown.js";

type Inline = {
  type: "text" | "link";
  text?: string;
  styles?: Record<string, boolean>;
  href?: string;
  content?: Array<{ type: "text"; text: string; styles: Record<string, boolean> }>;
};

function blockId(): string {
  return randomUUID();
}

const inlinePattern =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/;

export function parseInline(text: string): Array<Inline> {
  const result: Array<Inline> = [];
  let rest = text;

  while (rest.length > 0) {
    const match = inlinePattern.exec(rest);

    if (!match || match.index === undefined) {
      result.push({ type: "text", text: rest, styles: {} });
      break;
    }

    if (match.index > 0) {
      result.push({ type: "text", text: rest.slice(0, match.index), styles: {} });
    }

    if (match[2] !== undefined) {
      result.push({ type: "text", text: match[2], styles: { bold: true } });
    } else if (match[4] !== undefined) {
      result.push({ type: "text", text: match[4], styles: { italic: true } });
    } else if (match[6] !== undefined) {
      result.push({ type: "text", text: match[6], styles: { strike: true } });
    } else if (match[8] !== undefined) {
      result.push({ type: "text", text: match[8], styles: { code: true } });
    } else if (match[10] !== undefined && match[11] !== undefined) {
      result.push({
        type: "link",
        href: match[11],
        content: [{ type: "text", text: match[10], styles: {} }],
      });
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return result;
}

function block(
  type: string,
  props: Record<string, unknown>,
  content: Array<Inline>
): LeafBlock {
  return {
    id: blockId(),
    type,
    props,
    content: content as LeafBlock["content"],
    children: [],
  };
}

export function markdownToBlocks(markdown: string): Array<LeafBlock> {
  const blocks: Array<LeafBlock> = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let paragraph: Array<string> = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(block("paragraph", {}, parseInline(paragraph.join(" "))));
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = /^```(\w*)\s*$/.exec(trimmed);

    if (fence) {
      flushParagraph();

      const code: Array<string> = [];

      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        block("codeBlock", { language: fence[1] ?? "" }, [
          { type: "text", text: code.join("\n"), styles: {} },
        ])
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);

    if (heading) {
      flushParagraph();
      blocks.push(
        block("heading", { level: heading[1].length }, parseInline(heading[2]))
      );
      index += 1;
      continue;
    }

    if (/^(---|\*\*\*)$/.test(trimmed)) {
      flushParagraph();
      blocks.push(block("divider", {}, []));
      index += 1;
      continue;
    }

    const check = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);

    if (check) {
      flushParagraph();
      blocks.push(
        block(
          "checkListItem",
          { checked: check[1].toLowerCase() === "x" },
          parseInline(check[2])
        )
      );
      index += 1;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);

    if (bullet) {
      flushParagraph();
      blocks.push(block("bulletListItem", {}, parseInline(bullet[1])));
      index += 1;
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (numbered) {
      flushParagraph();
      blocks.push(block("numberedListItem", {}, parseInline(numbered[1])));
      index += 1;
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);

    if (quote) {
      flushParagraph();
      blocks.push(block("quote", {}, parseInline(quote[1])));
      index += 1;
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();

  if (blocks.length === 0) {
    blocks.push(block("paragraph", {}, []));
  }

  return blocks;
}

export function plainTextOfMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_~`[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
