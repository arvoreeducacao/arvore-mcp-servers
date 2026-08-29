import { GoogleSheetsMCPError, GridRange } from "./types.js";

export interface ParsedA1 {
  sheetTitle?: string;
  grid: Omit<GridRange, "sheetId">;
}

export function columnToIndex(letters: string): number {
  if (!/^[A-Za-z]+$/.test(letters)) {
    throw new GoogleSheetsMCPError(`Not a column reference: "${letters}"`, "INVALID_PARAMS");
  }

  let index = 0;
  for (const character of letters.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

export function splitSheetTitle(range: string): { sheetTitle?: string; cells: string } {
  const trimmed = range.trim();

  if (trimmed.startsWith("'")) {
    const closing = findClosingQuote(trimmed);
    if (closing === -1) {
      throw new GoogleSheetsMCPError(`Unbalanced quote in range "${range}"`, "INVALID_PARAMS");
    }
    const sheetTitle = trimmed.slice(1, closing).replace(/''/g, "'");
    const rest = trimmed.slice(closing + 1);
    if (rest !== "" && !rest.startsWith("!")) {
      throw new GoogleSheetsMCPError(`Malformed range "${range}"`, "INVALID_PARAMS");
    }
    return { sheetTitle, cells: rest.slice(1) };
  }

  const separator = trimmed.lastIndexOf("!");
  if (separator === -1) {
    return isCellReference(trimmed) ? { cells: trimmed } : { sheetTitle: trimmed, cells: "" };
  }

  return { sheetTitle: trimmed.slice(0, separator), cells: trimmed.slice(separator + 1) };
}

export function parseA1(range: string): ParsedA1 {
  const { sheetTitle, cells } = splitSheetTitle(range);
  return { ...(sheetTitle ? { sheetTitle } : {}), grid: cellsToGrid(cells) };
}

export function cellsToGrid(cells: string): Omit<GridRange, "sheetId"> {
  const trimmed = cells.trim();
  if (trimmed === "") return {};

  const [left, right = left] = trimmed.split(":");
  const start = parseCell(left, trimmed);
  const end = parseCell(right, trimmed);

  if (Boolean(start.column === undefined) !== Boolean(end.column === undefined)) {
    throw new GoogleSheetsMCPError(
      `Range "${cells}" mixes a cell with a whole row or column`,
      "INVALID_PARAMS"
    );
  }
  if (Boolean(start.row === undefined) !== Boolean(end.row === undefined)) {
    throw new GoogleSheetsMCPError(
      `Range "${cells}" mixes a cell with a whole row or column`,
      "INVALID_PARAMS"
    );
  }

  const grid: Omit<GridRange, "sheetId"> = {};

  if (start.column !== undefined && end.column !== undefined) {
    grid.startColumnIndex = Math.min(start.column, end.column);
    grid.endColumnIndex = Math.max(start.column, end.column) + 1;
  }
  if (start.row !== undefined && end.row !== undefined) {
    grid.startRowIndex = Math.min(start.row, end.row);
    grid.endRowIndex = Math.max(start.row, end.row) + 1;
  }

  return grid;
}

export function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function parseCell(
  reference: string,
  fullRange: string
): { column?: number; row?: number } {
  const match = /^\$?([A-Za-z]*)\$?(\d*)$/.exec(reference.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    throw new GoogleSheetsMCPError(`Not an A1 range: "${fullRange}"`, "INVALID_PARAMS");
  }

  return {
    ...(match[1] ? { column: columnToIndex(match[1]) } : {}),
    ...(match[2] ? { row: Number(match[2]) - 1 } : {}),
  };
}

const SINGLE_CELL = /^\$?[A-Za-z]{1,3}\$?\d{1,7}$/;
const RANGE_SIDE = /^\$?[A-Za-z]{0,3}\$?\d{0,7}$/;

function isCellReference(value: string): boolean {
  if (value.includes(":")) {
    const sides = value.split(":");
    return (
      sides.length === 2 &&
      sides.every((side) => side !== "" && RANGE_SIDE.test(side))
    );
  }
  return SINGLE_CELL.test(value);
}

function findClosingQuote(value: string): number {
  let position = 1;
  while (position < value.length) {
    if (value[position] === "'") {
      if (value[position + 1] === "'") {
        position += 2;
        continue;
      }
      return position;
    }
    position += 1;
  }
  return -1;
}
