import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "./markdown.js";
import {
  markdownToBlocks,
  parseInline,
  plainTextOfMarkdown,
} from "./markdown-to-blocks.js";

describe("parseInline", () => {
  it("parses styles and links", () => {
    const inline = parseInline("um **negrito** e [site](https://a.com) e `x`");

    expect(inline).toEqual([
      { type: "text", text: "um ", styles: {} },
      { type: "text", text: "negrito", styles: { bold: true } },
      { type: "text", text: " e ", styles: {} },
      {
        type: "link",
        href: "https://a.com",
        content: [{ type: "text", text: "site", styles: {} }],
      },
      { type: "text", text: " e ", styles: {} },
      { type: "text", text: "x", styles: { code: true } },
    ]);
  });
});

describe("markdownToBlocks", () => {
  it("parses block types", () => {
    const blocks = markdownToBlocks(
      [
        "# Titulo",
        "",
        "Um paragrafo",
        "com duas linhas",
        "",
        "- item",
        "- [x] feito",
        "1. primeiro",
        "> nota",
        "---",
        "```ts",
        "const a = 1",
        "```",
      ].join("\n")
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "bulletListItem",
      "checkListItem",
      "numberedListItem",
      "quote",
      "divider",
      "codeBlock",
    ]);
    expect(blocks[0].props).toEqual({ level: 1 });
    expect(blocks[3].props).toEqual({ checked: true });
    expect(blocks.every((block) => typeof block.id === "string")).toBe(true);
  });

  it("round-trips through the markdown renderer", () => {
    const source = [
      "## Plano",
      "Texto com **peso**",
      "- um",
      "- dois",
      "> aviso",
    ].join("\n");

    expect(blocksToMarkdown(markdownToBlocks(source))).toBe(source);
  });

  it("produces one empty paragraph for empty input", () => {
    const blocks = markdownToBlocks("");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });
});

describe("plainTextOfMarkdown", () => {
  it("strips markdown syntax for the search index", () => {
    expect(plainTextOfMarkdown("# Oi\n**mundo** [a](https://b)")).toBe(
      "Oi mundo a https://b"
    );
  });
});
