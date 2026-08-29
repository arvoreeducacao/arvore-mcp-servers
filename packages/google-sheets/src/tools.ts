import { columnToIndex, parseA1, quoteSheetTitle } from "./a1.js";
import { GoogleSheetsClient } from "./client.js";
import {
  AddSheetParams,
  AppendRowsParams,
  BatchUpdateParams,
  CellValue,
  ClearRangeParams,
  CopySpreadsheetParams,
  CreateSpreadsheetParams,
  DeleteDimensionParams,
  DeleteSheetParams,
  DescribeSpreadsheetParams,
  ExportSpreadsheetParams,
  FindReplaceParams,
  FormatCellsParams,
  GoogleSheetsMCPError,
  GridRange,
  InsertDimensionParams,
  ListSpreadsheetsParams,
  McpToolResult,
  ReadRangeParams,
  RenameSheetParams,
  SortRangeParams,
  Spreadsheet,
  WriteRangeParams,
} from "./types.js";

const EXPORT_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const METADATA_FIELDS =
  "spreadsheetId,spreadsheetUrl,properties(title,locale,timeZone),sheets(properties(sheetId,title,index,sheetType,hidden,gridProperties)),namedRanges(name,range)";

const MAX_PREVIEWED_SHEETS = 20;

export interface GoogleSheetsMCPToolsOptions {
  allowLocalWrites: boolean;
}

export class GoogleSheetsMCPTools {
  constructor(
    private client: GoogleSheetsClient,
    private options: GoogleSheetsMCPToolsOptions = { allowLocalWrites: true }
  ) {}

  async listSpreadsheets(params: ListSpreadsheetsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const files = await this.client.listSpreadsheets(params);
      return json({
        count: files.length,
        spreadsheets: files.map((file) => ({
          spreadsheetId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.emailAddress,
          webViewLink: file.webViewLink,
        })),
      });
    });
  }

  async createSpreadsheet(params: CreateSpreadsheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const spreadsheet = await this.client.createSpreadsheet(params.title, params.sheetTitles);
      if (params.folderId) {
        await this.client.moveFile(spreadsheet.spreadsheetId, params.folderId);
      }

      return json({
        spreadsheetId: spreadsheet.spreadsheetId,
        title: spreadsheet.properties?.title,
        sheets: (spreadsheet.sheets || []).map((sheet) => ({
          sheetId: sheet.properties?.sheetId,
          title: sheet.properties?.title,
        })),
        url: spreadsheetUrl(spreadsheet.spreadsheetId),
      });
    });
  }

  async copySpreadsheet(params: CopySpreadsheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const copy = await this.client.copyFile(params.spreadsheetId, params.title, params.folderId);
      return json({
        spreadsheetId: copy.id,
        title: copy.name,
        url: spreadsheetUrl(copy.id),
      });
    });
  }

  async describeSpreadsheet(params: DescribeSpreadsheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const spreadsheet = await this.client.getSpreadsheet(params.spreadsheetId, {
        fields: METADATA_FIELDS,
      });

      const sheets = (spreadsheet.sheets || []).map((sheet) => ({
        sheetId: sheet.properties?.sheetId,
        title: sheet.properties?.title,
        index: sheet.properties?.index,
        hidden: sheet.properties?.hidden || false,
        rowCount: sheet.properties?.gridProperties?.rowCount,
        columnCount: sheet.properties?.gridProperties?.columnCount,
        frozenRowCount: sheet.properties?.gridProperties?.frozenRowCount || 0,
      }));

      const previews = params.previewRows > 0 ? await this.previewSheets(spreadsheet, params.previewRows) : {};

      return json({
        spreadsheetId: spreadsheet.spreadsheetId,
        title: spreadsheet.properties?.title,
        locale: spreadsheet.properties?.locale,
        timeZone: spreadsheet.properties?.timeZone,
        sheetCount: sheets.length,
        sheets,
        namedRanges: (spreadsheet.namedRanges || []).map((named) => named.name),
        ...(params.previewRows > 0 ? { previews } : {}),
        url: spreadsheetUrl(spreadsheet.spreadsheetId),
      });
    });
  }

  async readRange(params: ReadRangeParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.batchGetValues(params.spreadsheetId, params.ranges, {
        valueRenderOption: params.valueRender,
        majorDimension: params.majorDimension,
      });

      return json({
        ranges: (result.valueRanges || []).map((valueRange) => ({
          range: valueRange.range,
          rowCount: valueRange.values?.length || 0,
          values: valueRange.values || [],
        })),
      });
    });
  }

  async writeRange(params: WriteRangeParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.updateValues(
        params.spreadsheetId,
        params.range,
        params.values as CellValue[][],
        { valueInputOption: params.valueInput, majorDimension: params.majorDimension }
      );

      return json({
        updatedRange: result.updatedRange,
        updatedCells: result.updatedCells,
        updatedRows: result.updatedRows,
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async appendRows(params: AppendRowsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.appendValues(
        params.spreadsheetId,
        params.range,
        params.values as CellValue[][],
        {
          valueInputOption: params.valueInput,
          insertDataOption: params.insertRows ? "INSERT_ROWS" : "OVERWRITE",
        }
      );

      return json({
        updatedRange: result.updates?.updatedRange,
        appendedRows: result.updates?.updatedRows,
        updatedCells: result.updates?.updatedCells,
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async clearRange(params: ClearRangeParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.clearValues(params.spreadsheetId, params.range);
      return json({
        clearedRange: result.clearedRange,
        note: "Values are gone; formatting, validation and conditional formats stay.",
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async addSheet(params: AddSheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.batchUpdate(params.spreadsheetId, [
        {
          addSheet: {
            properties: {
              title: params.title,
              ...(params.index !== undefined ? { index: params.index } : {}),
              gridProperties: { rowCount: params.rowCount, columnCount: params.columnCount },
            },
          },
        },
      ]);

      const properties = (
        result.replies?.[0]?.addSheet as { properties?: { sheetId?: number } } | undefined
      )?.properties;

      return json({
        sheetId: properties?.sheetId,
        title: params.title,
        url: spreadsheetUrl(params.spreadsheetId, properties?.sheetId),
      });
    });
  }

  async deleteSheet(params: DeleteSheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const spreadsheet = await this.metadata(params.spreadsheetId);
      if ((spreadsheet.sheets || []).length <= 1) {
        throw new GoogleSheetsMCPError(
          "A spreadsheet must keep at least one tab — this is its only one",
          "INVALID_PARAMS"
        );
      }

      const sheetId = findSheetId(spreadsheet, params.sheetTitle);
      await this.client.batchUpdate(params.spreadsheetId, [{ deleteSheet: { sheetId } }]);

      return json({
        deleted: params.sheetTitle,
        sheetId,
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async renameSheet(params: RenameSheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const sheetId = findSheetId(await this.metadata(params.spreadsheetId), params.sheetTitle);

      await this.client.batchUpdate(params.spreadsheetId, [
        {
          updateSheetProperties: {
            properties: { sheetId, title: params.newTitle },
            fields: "title",
          },
        },
      ]);

      return json({
        sheetId,
        title: params.newTitle,
        url: spreadsheetUrl(params.spreadsheetId, sheetId),
      });
    });
  }

  async insertDimension(params: InsertDimensionParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const sheetId = findSheetId(await this.metadata(params.spreadsheetId), params.sheetTitle);

      await this.client.batchUpdate(params.spreadsheetId, [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: params.dimension,
              startIndex: params.startIndex,
              endIndex: params.startIndex + params.count,
            },
            inheritFromBefore: params.inheritFromBefore && params.startIndex > 0,
          },
        },
      ]);

      return json({
        inserted: params.count,
        dimension: params.dimension,
        at: params.startIndex,
        url: spreadsheetUrl(params.spreadsheetId, sheetId),
      });
    });
  }

  async deleteDimension(params: DeleteDimensionParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const sheetId = findSheetId(await this.metadata(params.spreadsheetId), params.sheetTitle);

      await this.client.batchUpdate(params.spreadsheetId, [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: params.dimension,
              startIndex: params.startIndex,
              endIndex: params.startIndex + params.count,
            },
          },
        },
      ]);

      return json({
        deleted: params.count,
        dimension: params.dimension,
        at: params.startIndex,
        url: spreadsheetUrl(params.spreadsheetId, sheetId),
      });
    });
  }

  async sortRange(params: SortRangeParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const range = await this.toGridRange(params.spreadsheetId, params.range);

      await this.client.batchUpdate(params.spreadsheetId, [
        {
          sortRange: {
            range,
            sortSpecs: params.sortBy.map((spec) => ({
              dimensionIndex: columnToIndex(spec.column),
              sortOrder: spec.descending ? "DESCENDING" : "ASCENDING",
            })),
          },
        },
      ]);

      return json({
        sorted: params.range,
        by: params.sortBy,
        url: spreadsheetUrl(params.spreadsheetId, range.sheetId),
      });
    });
  }

  async formatCells(params: FormatCellsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const range = await this.toGridRange(params.spreadsheetId, params.range);
      const { userEnteredFormat, fields } = buildCellFormat(params);

      if (fields.length === 0) {
        throw new GoogleSheetsMCPError(
          "Nothing to change — pass at least one format",
          "INVALID_PARAMS"
        );
      }

      await this.client.batchUpdate(params.spreadsheetId, [
        {
          repeatCell: {
            range,
            cell: { userEnteredFormat },
            fields: fields.join(","),
          },
        },
      ]);

      return json({
        formatted: params.range,
        applied: fields,
        url: spreadsheetUrl(params.spreadsheetId, range.sheetId),
      });
    });
  }

  async findReplace(params: FindReplaceParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const scope = params.sheetTitle
        ? { sheetId: findSheetId(await this.metadata(params.spreadsheetId), params.sheetTitle) }
        : { allSheets: true };

      const result = await this.client.batchUpdate(params.spreadsheetId, [
        {
          findReplace: {
            find: params.find,
            replacement: params.replace,
            matchCase: params.matchCase,
            matchEntireCell: params.matchEntireCell,
            searchByRegex: params.searchByRegex,
            includeFormulas: params.includeFormulas,
            ...scope,
          },
        },
      ]);

      const reply = result.replies?.[0]?.findReplace as
        | { occurrencesChanged?: number; valuesChanged?: number; rowsChanged?: number }
        | undefined;

      return json({
        find: params.find,
        occurrencesChanged: reply?.occurrencesChanged || 0,
        valuesChanged: reply?.valuesChanged || 0,
        rowsChanged: reply?.rowsChanged || 0,
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async batchUpdate(params: BatchUpdateParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.batchUpdate(
        params.spreadsheetId,
        params.requests as Record<string, unknown>[]
      );
      return json({
        applied: params.requests.length,
        replies: result.replies,
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  async exportSpreadsheet(params: ExportSpreadsheetParams): Promise<McpToolResult> {
    return this.guard(async () => {
      if (params.destinationPath && !this.options.allowLocalWrites) {
        throw new GoogleSheetsMCPError(
          "destinationPath is only available when the server runs locally over stdio",
          "INVALID_PARAMS"
        );
      }

      const bytes =
        params.format === "csv"
          ? Buffer.from(await this.renderCsv(params.spreadsheetId, params.sheetTitle), "utf-8")
          : await this.client.exportFile(params.spreadsheetId, EXPORT_MIME_TYPES[params.format]);

      if (params.destinationPath) {
        const { isAbsolute } = await import("node:path");
        if (!isAbsolute(params.destinationPath)) {
          throw new GoogleSheetsMCPError(
            "destinationPath must be an absolute path",
            "INVALID_PARAMS"
          );
        }
        const { writeFile } = await import("node:fs/promises");
        await writeFile(params.destinationPath, bytes);
        return json({ format: params.format, bytes: bytes.length, path: params.destinationPath });
      }

      if (params.format === "csv") {
        return {
          content: [{ type: "text" as const, text: bytes.toString("utf-8").slice(0, 200_000) }],
        };
      }

      return json({
        format: params.format,
        bytes: bytes.length,
        note: "Binary export not returned inline. Pass destinationPath when running locally, or open the spreadsheet URL.",
        url: spreadsheetUrl(params.spreadsheetId),
      });
    });
  }

  private async renderCsv(spreadsheetId: string, sheetTitle?: string): Promise<string> {
    const spreadsheet = await this.metadata(spreadsheetId);
    const title = sheetTitle || spreadsheet.sheets?.[0]?.properties?.title;

    if (!title) {
      throw new GoogleSheetsMCPError("Spreadsheet has no tab to export", "NOT_FOUND");
    }

    findSheetId(spreadsheet, title);

    const result = await this.client.batchGetValues(spreadsheetId, [quoteSheetTitle(title)], {
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension: "ROWS",
    });

    return toCsv(result.valueRanges?.[0]?.values || []);
  }

  private async previewSheets(
    spreadsheet: Spreadsheet,
    previewRows: number
  ): Promise<Record<string, CellValue[][]>> {
    const titles = (spreadsheet.sheets || [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, MAX_PREVIEWED_SHEETS);

    if (titles.length === 0) return {};

    const result = await this.client.batchGetValues(
      spreadsheet.spreadsheetId,
      titles.map((title) => `${quoteSheetTitle(title)}!1:${previewRows}`),
      { valueRenderOption: "FORMATTED_VALUE", majorDimension: "ROWS" }
    );

    const previews: Record<string, CellValue[][]> = {};
    titles.forEach((title, index) => {
      previews[title] = result.valueRanges?.[index]?.values || [];
    });
    return previews;
  }

  private async metadata(spreadsheetId: string): Promise<Spreadsheet> {
    return this.client.getSpreadsheet(spreadsheetId, { fields: METADATA_FIELDS });
  }

  private async toGridRange(spreadsheetId: string, a1: string): Promise<GridRange> {
    const parsed = parseA1(a1);
    const spreadsheet = await this.metadata(spreadsheetId);

    const sheetId = parsed.sheetTitle
      ? findSheetId(spreadsheet, parsed.sheetTitle)
      : spreadsheet.sheets?.[0]?.properties?.sheetId;

    if (sheetId === undefined) {
      throw new GoogleSheetsMCPError(`Could not resolve a tab for range "${a1}"`, "NOT_FOUND");
    }

    return { sheetId, ...parsed.grid };
  }

  private async guard(action: () => Promise<McpToolResult>): Promise<McpToolResult> {
    try {
      return await action();
    } catch (error) {
      const message =
        error instanceof GoogleSheetsMCPError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown error";

      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  }
}

export function findSheetId(spreadsheet: Spreadsheet, title: string): number {
  const match = (spreadsheet.sheets || []).find(
    (sheet) => sheet.properties?.title?.toLowerCase() === title.toLowerCase()
  );

  if (!match?.properties || match.properties.sheetId === undefined) {
    const available = (spreadsheet.sheets || [])
      .map((sheet) => sheet.properties?.title)
      .filter(Boolean)
      .join(", ");
    throw new GoogleSheetsMCPError(
      `No tab named "${title}". Available: ${available || "none"}`,
      "NOT_FOUND"
    );
  }

  return match.properties.sheetId;
}

export function buildCellFormat(params: FormatCellsParams): {
  userEnteredFormat: Record<string, unknown>;
  fields: string[];
} {
  const textFormat: Record<string, unknown> = {};
  const userEnteredFormat: Record<string, unknown> = {};
  const fields: string[] = [];

  if (params.bold !== undefined) {
    textFormat.bold = params.bold;
    fields.push("userEnteredFormat.textFormat.bold");
  }
  if (params.italic !== undefined) {
    textFormat.italic = params.italic;
    fields.push("userEnteredFormat.textFormat.italic");
  }
  if (params.strikethrough !== undefined) {
    textFormat.strikethrough = params.strikethrough;
    fields.push("userEnteredFormat.textFormat.strikethrough");
  }
  if (params.fontSize !== undefined) {
    textFormat.fontSize = params.fontSize;
    fields.push("userEnteredFormat.textFormat.fontSize");
  }
  if (params.fontFamily !== undefined) {
    textFormat.fontFamily = params.fontFamily;
    fields.push("userEnteredFormat.textFormat.fontFamily");
  }
  if (params.foregroundColor !== undefined) {
    textFormat.foregroundColor = hexToRgb(params.foregroundColor);
    fields.push("userEnteredFormat.textFormat.foregroundColor");
  }
  if (Object.keys(textFormat).length > 0) {
    userEnteredFormat.textFormat = textFormat;
  }

  if (params.backgroundColor !== undefined) {
    userEnteredFormat.backgroundColor = hexToRgb(params.backgroundColor);
    fields.push("userEnteredFormat.backgroundColor");
  }
  if (params.horizontalAlignment !== undefined) {
    userEnteredFormat.horizontalAlignment = params.horizontalAlignment;
    fields.push("userEnteredFormat.horizontalAlignment");
  }
  if (params.verticalAlignment !== undefined) {
    userEnteredFormat.verticalAlignment = params.verticalAlignment;
    fields.push("userEnteredFormat.verticalAlignment");
  }
  if (params.wrapStrategy !== undefined) {
    userEnteredFormat.wrapStrategy = params.wrapStrategy;
    fields.push("userEnteredFormat.wrapStrategy");
  }
  if (params.numberFormat !== undefined) {
    userEnteredFormat.numberFormat = {
      type: params.numberFormat.type,
      ...(params.numberFormat.pattern ? { pattern: params.numberFormat.pattern } : {}),
    };
    fields.push("userEnteredFormat.numberFormat");
  }

  return { userEnteredFormat, fields };
}

export function toCsv(rows: CellValue[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
}

export function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const value = hex.replace(/^#/, "");
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function spreadsheetUrl(spreadsheetId: string, sheetId?: number): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return sheetId === undefined ? base : `${base}#gid=${sheetId}`;
}

function json(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
