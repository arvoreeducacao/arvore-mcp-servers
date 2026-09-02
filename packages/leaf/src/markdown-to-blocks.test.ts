import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "./markdown.js";
import {
  markdownToBlocks,
  parseInline,
  parseTableRow,
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

  it("parses a markdown table into a table block", () => {
    const blocks = markdownToBlocks(
      [
        "| Camada | **Hoje** |",
        "| --- | :---: |",
        "| Editor | BlockNote |",
        "| Banco | MySQL |",
      ].join("\n")
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].content).toEqual({
      type: "tableContent",
      headerRows: 1,
      rows: [
        {
          cells: [
            [{ type: "text", text: "Camada", styles: {} }],
            [{ type: "text", text: "Hoje", styles: { bold: true } }],
          ],
        },
        {
          cells: [
            [{ type: "text", text: "Editor", styles: {} }],
            [{ type: "text", text: "BlockNote", styles: {} }],
          ],
        },
        {
          cells: [
            [{ type: "text", text: "Banco", styles: {} }],
            [{ type: "text", text: "MySQL", styles: {} }],
          ],
        },
      ],
    });
  });

  it("pads and truncates rows to the header width", () => {
    const blocks = markdownToBlocks(
      ["| a | b |", "| --- | --- |", "| so um |", "| um | dois | tres |"].join(
        "\n"
      )
    );
    const rows = (blocks[0].content as { rows: Array<{ cells: Array<unknown> }> })
      .rows;

    expect(rows.map((row) => row.cells.length)).toEqual([2, 2, 2]);
    expect(rows[1].cells[1]).toEqual([]);
  });

  it("keeps a pipe line without a delimiter row as a paragraph", () => {
    const blocks = markdownToBlocks("| isto nao e tabela |");

    expect(blocks.map((block) => block.type)).toEqual(["paragraph"]);
  });

  it("round-trips a table through the markdown renderer", () => {
    const source = [
      "| Tool | O que faz |",
      "| --- | --- |",
      "| get_document | Le um documento |",
      "| update_document | Escreve com \\| escapado |",
    ].join("\n");

    expect(blocksToMarkdown(markdownToBlocks(source))).toBe(source);
  });

  it("produces one empty paragraph for empty input", () => {
    const blocks = markdownToBlocks("");

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });
});

describe("parseTableRow", () => {
  it("splits cells and unescapes pipes", () => {
    expect(parseTableRow("| a | b \\| c |")).toEqual(["a", "b | c"]);
  });

  it("ignores a line that is not a table row", () => {
    expect(parseTableRow("nao e linha")).toBeNull();
  });
});

describe("plainTextOfMarkdown", () => {
  it("strips markdown syntax for the search index", () => {
    expect(plainTextOfMarkdown("# Oi\n**mundo** [a](https://b)")).toBe(
      "Oi mundo a https://b"
    );
  });
});
