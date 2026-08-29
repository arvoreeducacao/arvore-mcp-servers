import { describe, expect, it } from "vitest";
import { cellsToGrid, columnToIndex, parseA1, quoteSheetTitle, splitSheetTitle } from "./a1.js";

describe("columnToIndex", () => {
  it("maps the first letters", () => {
    expect(columnToIndex("A")).toBe(0);
    expect(columnToIndex("Z")).toBe(25);
  });

  it("maps two-letter columns", () => {
    expect(columnToIndex("AA")).toBe(26);
    expect(columnToIndex("AZ")).toBe(51);
    expect(columnToIndex("BA")).toBe(52);
  });

  it("is case insensitive", () => {
    expect(columnToIndex("ab")).toBe(columnToIndex("AB"));
  });

  it("rejects anything that is not a column", () => {
    expect(() => columnToIndex("A1")).toThrow();
  });
});

describe("splitSheetTitle", () => {
  it("splits a qualified range", () => {
    expect(splitSheetTitle("Sheet1!A1:C10")).toEqual({ sheetTitle: "Sheet1", cells: "A1:C10" });
  });

  it("reads a quoted tab with spaces", () => {
    expect(splitSheetTitle("'Relatório de Vendas'!A1:B2")).toEqual({
      sheetTitle: "Relatório de Vendas",
      cells: "A1:B2",
    });
  });

  it("unescapes doubled quotes inside a tab name", () => {
    expect(splitSheetTitle("'It''s here'!A1")).toEqual({ sheetTitle: "It's here", cells: "A1" });
  });

  it("treats a bare A1 range as the default tab", () => {
    expect(splitSheetTitle("A1:C10")).toEqual({ cells: "A1:C10" });
  });

  it("treats a bare name as a whole tab", () => {
    expect(splitSheetTitle("Sheet1")).toEqual({ sheetTitle: "Sheet1", cells: "" });
    expect(splitSheetTitle("Summary")).toEqual({ sheetTitle: "Summary", cells: "" });
  });

  it("keeps a tab name that itself contains an exclamation mark", () => {
    expect(splitSheetTitle("'Vendas! 2026'!A1:B2")).toEqual({
      sheetTitle: "Vendas! 2026",
      cells: "A1:B2",
    });
  });
});

describe("cellsToGrid", () => {
  it("returns an unbounded grid for a whole tab", () => {
    expect(cellsToGrid("")).toEqual({});
  });

  it("converts a bounded range to zero-based, end-exclusive indexes", () => {
    expect(cellsToGrid("A1:C10")).toEqual({
      startColumnIndex: 0,
      endColumnIndex: 3,
      startRowIndex: 0,
      endRowIndex: 10,
    });
  });

  it("converts a single cell", () => {
    expect(cellsToGrid("B2")).toEqual({
      startColumnIndex: 1,
      endColumnIndex: 2,
      startRowIndex: 1,
      endRowIndex: 2,
    });
  });

  it("leaves rows unbounded for whole columns", () => {
    expect(cellsToGrid("A:C")).toEqual({ startColumnIndex: 0, endColumnIndex: 3 });
  });

  it("leaves columns unbounded for whole rows", () => {
    expect(cellsToGrid("2:5")).toEqual({ startRowIndex: 1, endRowIndex: 5 });
  });

  it("normalizes a reversed range", () => {
    expect(cellsToGrid("C10:A1")).toEqual(cellsToGrid("A1:C10"));
  });

  it("ignores absolute markers", () => {
    expect(cellsToGrid("$A$1:$C$10")).toEqual(cellsToGrid("A1:C10"));
  });

  it("rejects a range that mixes a cell with a whole column", () => {
    expect(() => cellsToGrid("A1:C")).toThrow(/whole row or column/);
  });

  it("rejects nonsense", () => {
    expect(() => cellsToGrid("!!")).toThrow();
  });
});

describe("parseA1", () => {
  it("carries the tab and the grid together", () => {
    expect(parseA1("'Base 2026'!B2:D4")).toEqual({
      sheetTitle: "Base 2026",
      grid: {
        startColumnIndex: 1,
        endColumnIndex: 4,
        startRowIndex: 1,
        endRowIndex: 4,
      },
    });
  });

  it("omits the tab when the range has none", () => {
    expect(parseA1("A1")).toEqual({
      grid: { startColumnIndex: 0, endColumnIndex: 1, startRowIndex: 0, endRowIndex: 1 },
    });
  });
});

describe("quoteSheetTitle", () => {
  it("quotes and escapes", () => {
    expect(quoteSheetTitle("Resumo")).toBe("'Resumo'");
    expect(quoteSheetTitle("It's")).toBe("'It''s'");
  });

  it("round-trips through splitSheetTitle", () => {
    const title = "Vendas! 'do' ano";
    expect(splitSheetTitle(`${quoteSheetTitle(title)}!A1`).sheetTitle).toBe(title);
  });
});
