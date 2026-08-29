import { describe, expect, it } from "vitest";
import {
  bodyEndIndex,
  cellInsertIndex,
  hexToRgb,
  outlineBlocks,
  paragraphText,
  structuralText,
} from "./tools.js";
import { Document, StructuralElement } from "./types.js";

function paragraph(
  startIndex: number,
  text: string,
  style = "NORMAL_TEXT",
  bullet = false
): StructuralElement {
  return {
    startIndex,
    endIndex: startIndex + text.length,
    paragraph: {
      elements: [
        {
          startIndex,
          endIndex: startIndex + text.length,
          textRun: { content: text },
        },
      ],
      paragraphStyle: { namedStyleType: style },
      ...(bullet ? { bullet: { listId: "list-1" } } : {}),
    },
  };
}

describe("paragraphText", () => {
  it("joins the runs and drops the trailing newline", () => {
    expect(
      paragraphText({
        elements: [{ textRun: { content: "Olá " } }, { textRun: { content: "mundo\n" } }],
      })
    ).toBe("Olá mundo");
  });

  it("marks the elements that carry no text", () => {
    expect(
      paragraphText({ elements: [{ inlineObjectElement: { inlineObjectId: "i1" } }] })
    ).toBe("[image]");
    expect(paragraphText({ elements: [{ pageBreak: {} }] })).toBe("[page break]");
  });

  it("survives an empty paragraph", () => {
    expect(paragraphText({})).toBe("");
  });
});

describe("bodyEndIndex", () => {
  it("stops one before the document end, where an insert is legal", () => {
    const document: Document = { documentId: "d", body: { content: [paragraph(1, "abc\n")] } };
    expect(bodyEndIndex(document)).toBe(4);
  });

  it("falls back to the start of an empty document", () => {
    expect(bodyEndIndex({ documentId: "d" })).toBe(1);
  });
});

describe("cellInsertIndex", () => {
  it("uses the first paragraph inside the cell", () => {
    expect(cellInsertIndex({ startIndex: 10, content: [{ startIndex: 11 }] })).toBe(11);
  });

  it("falls back to just after the cell start", () => {
    expect(cellInsertIndex({ startIndex: 10 })).toBe(11);
  });
});

describe("structuralText", () => {
  it("joins the paragraphs of a cell", () => {
    expect(structuralText([paragraph(1, "line 1\n"), paragraph(9, "line 2\n")])).toBe(
      "line 1\nline 2"
    );
  });
});

describe("outlineBlocks", () => {
  const options = { includeTables: true, includeText: true };

  it("carries the indexes the edit tools take", () => {
    const blocks = outlineBlocks([paragraph(1, "Cabeçalho\n", "HEADING_1")], options);

    expect(blocks).toEqual([
      {
        startIndex: 1,
        endIndex: 11,
        type: "paragraph",
        style: "HEADING_1",
        text: "Cabeçalho",
      },
    ]);
  });

  it("marks list items", () => {
    const [block] = outlineBlocks([paragraph(1, "item\n", "NORMAL_TEXT", true)], options);
    expect(block.type).toBe("listItem");
    expect(block.bulleted).toBe(true);
  });

  it("flattens a table into cells with their insert indexes", () => {
    const table: StructuralElement = {
      startIndex: 10,
      endIndex: 30,
      table: {
        rows: 1,
        columns: 2,
        tableRows: [
          {
            tableCells: [
              { startIndex: 12, content: [paragraph(13, "a\n")] },
              { startIndex: 15, content: [paragraph(16, "b\n")] },
            ],
          },
        ],
      },
    };

    const [block] = outlineBlocks([table], options);

    expect(block.type).toBe("table");
    expect(block.rows).toBe(1);
    expect(block.cells).toEqual([
      { startIndex: 13, text: "a" },
      { startIndex: 16, text: "b" },
    ]);
  });

  it("drops the text when only the shape was asked for", () => {
    const [block] = outlineBlocks([paragraph(1, "Cabeçalho\n", "HEADING_1")], {
      includeTables: true,
      includeText: false,
    });
    expect(block.text).toBeUndefined();
    expect(block.startIndex).toBe(1);
  });

  it("names the structural elements that are not paragraphs", () => {
    const blocks = outlineBlocks(
      [{ startIndex: 1, endIndex: 2, sectionBreak: {} }, { startIndex: 2, endIndex: 3, tableOfContents: {} }],
      options
    );
    expect(blocks.map((block) => block.type)).toEqual(["sectionBreak", "tableOfContents"]);
  });
});

describe("hexToRgb", () => {
  it("normalizes to the 0..1 range the Docs API wants", () => {
    expect(hexToRgb("#000000")).toEqual({ red: 0, green: 0, blue: 0 });
    expect(hexToRgb("ffffff")).toEqual({ red: 1, green: 1, blue: 1 });
  });
});
