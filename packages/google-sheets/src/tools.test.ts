import { describe, expect, it } from "vitest";
import { buildCellFormat, findSheetId, hexToRgb, toCsv } from "./tools.js";
import { FormatCellsParams, Spreadsheet } from "./types.js";

const SPREADSHEET: Spreadsheet = {
  spreadsheetId: "abc",
  sheets: [
    { properties: { sheetId: 0, title: "Base" } },
    { properties: { sheetId: 1837, title: "Resumo 2026" } },
  ],
};

function formatParams(overrides: Partial<FormatCellsParams>): FormatCellsParams {
  return { spreadsheetId: "abc", range: "Base!A1:B2", ...overrides } as FormatCellsParams;
}

describe("findSheetId", () => {
  it("finds a tab by title", () => {
    expect(findSheetId(SPREADSHEET, "Resumo 2026")).toBe(1837);
  });

  it("ignores case", () => {
    expect(findSheetId(SPREADSHEET, "base")).toBe(0);
  });

  it("lists what exists when the tab does not", () => {
    expect(() => findSheetId(SPREADSHEET, "Vendas")).toThrow(/Base, Resumo 2026/);
  });
});

describe("buildCellFormat", () => {
  it("nests text properties and names their full field paths", () => {
    const { userEnteredFormat, fields } = buildCellFormat(
      formatParams({ bold: true, fontSize: 12 })
    );

    expect(userEnteredFormat).toEqual({ textFormat: { bold: true, fontSize: 12 } });
    expect(fields).toEqual([
      "userEnteredFormat.textFormat.bold",
      "userEnteredFormat.textFormat.fontSize",
    ]);
  });

  it("keeps cell-level properties out of textFormat", () => {
    const { userEnteredFormat, fields } = buildCellFormat(
      formatParams({ backgroundColor: "#ffffff", wrapStrategy: "WRAP" })
    );

    expect(userEnteredFormat).toEqual({
      backgroundColor: { red: 1, green: 1, blue: 1 },
      wrapStrategy: "WRAP",
    });
    expect(fields).toEqual([
      "userEnteredFormat.backgroundColor",
      "userEnteredFormat.wrapStrategy",
    ]);
  });

  it("carries a number pattern", () => {
    const { userEnteredFormat } = buildCellFormat(
      formatParams({ numberFormat: { type: "CURRENCY", pattern: "R$ #,##0.00" } })
    );

    expect(userEnteredFormat.numberFormat).toEqual({
      type: "CURRENCY",
      pattern: "R$ #,##0.00",
    });
  });

  it("asks for nothing when nothing was passed", () => {
    expect(buildCellFormat(formatParams({})).fields).toEqual([]);
  });

  it("keeps false as an intentional value", () => {
    const { userEnteredFormat, fields } = buildCellFormat(formatParams({ bold: false }));
    expect(userEnteredFormat).toEqual({ textFormat: { bold: false } });
    expect(fields).toEqual(["userEnteredFormat.textFormat.bold"]);
  });
});

describe("hexToRgb", () => {
  it("normalizes to the 0..1 range the Sheets API wants", () => {
    expect(hexToRgb("#000000")).toEqual({ red: 0, green: 0, blue: 0 });
    expect(hexToRgb("ffffff")).toEqual({ red: 1, green: 1, blue: 1 });
  });
});

describe("toCsv", () => {
  it("renders plain rows", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\nc,d");
  });

  it("quotes separators, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines"]])).toBe('"a,b","say ""hi""","two\nlines"');
  });

  it("renders empty cells and non-strings", () => {
    expect(toCsv([[null, 3, true]])).toBe(",3,true");
  });
});
