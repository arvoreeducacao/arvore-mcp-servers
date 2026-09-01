import { describe, expect, it } from "vitest";
import { blocksToMarkdown, contentToMarkdown, inlineToMarkdown } from "./markdown.js";

const text = (value: string, styles = {}) => ({
  type: "text",
  text: value,
  styles,
});

describe("inlineToMarkdown", () => {
  it("renders styled text", () => {
    expect(
      inlineToMarkdown([
        text("negrito", { bold: true }),
        text(" e "),
        text("codigo", { code: true }),
      ])
    ).toBe("**negrito** e `codigo`");
  });

  it("renders links with label and href fallback", () => {
    expect(
      inlineToMarkdown([
        { type: "link", href: "https://a.com", content: [text("site")] },
        { type: "link", href: "https://b.com" },
      ])
    ).toBe("[site](https://a.com)[https://b.com](https://b.com)");
  });

  it("returns empty string for non-array content", () => {
    expect(inlineToMarkdown(undefined)).toBe("");
    expect(inlineToMarkdown({ type: "tableContent" })).toBe("");
  });
});

describe("blocksToMarkdown", () => {
  it("renders headings, lists and quotes", () => {
    const markdown = blocksToMarkdown([
      { type: "heading", props: { level: 2 }, content: [text("Titulo")] },
      { type: "bulletListItem", content: [text("um")] },
      { type: "numberedListItem", content: [text("primeiro")] },
      { type: "numberedListItem", content: [text("segundo")] },
      { type: "checkListItem", props: { checked: true }, content: [text("feito")] },
      { type: "quote", content: [text("citacao")] },
    ]);

    expect(markdown).toBe(
      [
        "## Titulo",
        "- um",
        "1. primeiro",
        "2. segundo",
        "- [x] feito",
        "> citacao",
      ].join("\n")
    );
  });

  it("indents nested children", () => {
    const markdown = blocksToMarkdown([
      {
        type: "bulletListItem",
        content: [text("pai")],
        children: [{ type: "bulletListItem", content: [text("filho")] }],
      },
    ]);

    expect(markdown).toBe("- pai\n  - filho");
  });

  it("renders code blocks with language", () => {
    const markdown = blocksToMarkdown([
      { type: "codeBlock", props: { language: "ts" }, content: [text("const a = 1")] },
    ]);

    expect(markdown).toBe("```ts\nconst a = 1\n```");
  });

  it("renders tables with a divider row", () => {
    const markdown = blocksToMarkdown([
      {
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: [[text("a")], [text("b")]] },
            { cells: [[text("1")], [text("2|3")]] },
          ],
        },
      },
    ]);

    expect(markdown).toBe(
      ["| a | b |", "| --- | --- |", "| 1 | 2\\|3 |"].join("\n")
    );
  });

  it("renders images, dividers and embedded databases", () => {
    const markdown = blocksToMarkdown([
      { type: "image", props: { url: "https://x/img.png", caption: "foto" } },
      { type: "divider", props: {} },
      { type: "database", props: { databaseId: "abc123" } },
    ]);

    expect(markdown).toBe(
      [
        "![foto](https://x/img.png)",
        "---",
        "[embedded database](/doc/abc123)",
      ].join("\n")
    );
  });

  it("restarts numbering after a non-numbered block", () => {
    const markdown = blocksToMarkdown([
      { type: "numberedListItem", content: [text("um")] },
      { type: "paragraph", content: [text("corte")] },
      { type: "numberedListItem", content: [text("recomeca")] },
    ]);

    expect(markdown).toBe(["1. um", "corte", "1. recomeca"].join("\n"));
  });
});

describe("contentToMarkdown", () => {
  it("parses serialized documents", () => {
    const serialized = JSON.stringify([
      { type: "paragraph", content: [text("ola")] },
    ]);

    expect(contentToMarkdown(serialized)).toBe("ola");
  });

  it("returns empty string for null, invalid json and non-arrays", () => {
    expect(contentToMarkdown(null)).toBe("");
    expect(contentToMarkdown("not json")).toBe("");
    expect(contentToMarkdown('{"a":1}')).toBe("");
  });
});
