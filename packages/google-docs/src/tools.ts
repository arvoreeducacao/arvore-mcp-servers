import { GoogleDocsClient } from "./client.js";
import {
  AppendParagraphsParams,
  BatchUpdateParams,
  CopyDocumentParams,
  CreateDocumentFromMarkdownParams,
  CreateDocumentParams,
  DeleteRangeParams,
  Document,
  ExportDocumentParams,
  FormatParagraphParams,
  FormatTextParams,
  GetDocumentParams,
  GoogleDocsMCPError,
  InsertImageParams,
  InsertPageBreakParams,
  InsertTableParams,
  InsertTextParams,
  ListDocumentsParams,
  McpToolResult,
  OutlineDocumentParams,
  OverwriteDocumentFromMarkdownParams,
  Paragraph,
  ReadDocumentParams,
  ReplaceAllTextParams,
  StructuralElement,
  TableCell,
} from "./types.js";

const EXPORT_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  epub: "application/epub+zip",
};

export interface GoogleDocsMCPToolsOptions {
  allowLocalWrites: boolean;
}

export class GoogleDocsMCPTools {
  constructor(
    private client: GoogleDocsClient,
    private options: GoogleDocsMCPToolsOptions = { allowLocalWrites: true }
  ) {}

  async listDocuments(params: ListDocumentsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const files = await this.client.listDocuments(params);
      return json({
        count: files.length,
        documents: files.map((file) => ({
          documentId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.emailAddress,
          webViewLink: file.webViewLink,
        })),
      });
    });
  }

  async createDocument(params: CreateDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const document = await this.client.createDocument(params.title);
      if (params.folderId) {
        await this.client.moveFile(document.documentId, params.folderId);
      }
      return json({
        documentId: document.documentId,
        title: document.title,
        url: documentUrl(document.documentId),
      });
    });
  }

  async createDocumentFromMarkdown(
    params: CreateDocumentFromMarkdownParams
  ): Promise<McpToolResult> {
    return this.guard(async () => {
      const file = await this.client.createFromMarkdown(
        params.title,
        params.markdown,
        params.folderId
      );
      return json({
        documentId: file.id,
        title: file.name,
        url: documentUrl(file.id),
      });
    });
  }

  async overwriteDocumentFromMarkdown(
    params: OverwriteDocumentFromMarkdownParams
  ): Promise<McpToolResult> {
    return this.guard(async () => {
      const file = await this.client.overwriteFromMarkdown(params.documentId, params.markdown);
      return json({
        documentId: file.id,
        title: file.name,
        note: "The previous content is gone from the live document but still in File > Version history. Comments anchored to replaced text become orphaned.",
        url: documentUrl(params.documentId),
      });
    });
  }

  async copyDocument(params: CopyDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const copy = await this.client.copyFile(params.documentId, params.title, params.folderId);
      return json({
        documentId: copy.id,
        title: copy.name,
        url: documentUrl(copy.id),
      });
    });
  }

  async readDocument(params: ReadDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const bytes = await this.client.exportFile(params.documentId, EXPORT_MIME_TYPES.md);
      const markdown = bytes.toString("utf-8");
      const truncated = markdown.length > params.maxCharacters;

      return {
        content: [
          {
            type: "text" as const,
            text: truncated
              ? `${markdown.slice(0, params.maxCharacters)}\n\n[truncated at ${params.maxCharacters} of ${markdown.length} characters — raise maxCharacters or use outline_document]`
              : markdown,
          },
        ],
      };
    });
  }

  async outlineDocument(params: OutlineDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const document = await this.client.getDocument(params.documentId);
      const blocks = outlineBlocks(document.body?.content || [], params);

      return json({
        documentId: document.documentId,
        title: document.title,
        revisionId: document.revisionId,
        endIndex: bodyEndIndex(document),
        blockCount: blocks.length,
        url: documentUrl(document.documentId),
        note: "Indexes shift after every edit. Re-read this outline between edits, or send one batch_update_document with the requests ordered from the highest index to the lowest.",
        blocks,
      });
    });
  }

  async getDocument(params: GetDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const document = await this.client.getDocument(params.documentId, params.fields);
      return json(document);
    });
  }

  async insertText(params: InsertTextParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const index = params.index ?? (await this.appendIndex(params.documentId));

      await this.client.batchUpdate(params.documentId, [
        {
          insertText: {
            text: params.text,
            location: { index, ...(params.segmentId ? { segmentId: params.segmentId } : {}) },
          },
        },
      ]);

      return json({
        insertedAt: index,
        characters: params.text.length,
        nextIndex: index + params.text.length,
        url: documentUrl(params.documentId),
      });
    });
  }

  async appendParagraphs(params: AppendParagraphsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      let cursor = await this.appendIndex(params.documentId);
      const requests: Record<string, unknown>[] = [];

      for (const paragraph of params.paragraphs) {
        const text = `${paragraph.text}\n`;
        const range = { startIndex: cursor, endIndex: cursor + text.length };

        requests.push({ insertText: { text, location: { index: cursor } } });
        requests.push({
          updateParagraphStyle: {
            range,
            paragraphStyle: { namedStyleType: paragraph.style },
            fields: "namedStyleType",
          },
        });
        if (paragraph.bulleted) {
          requests.push({
            createParagraphBullets: {
              range,
              bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
            },
          });
        }

        cursor += text.length;
      }

      await this.client.batchUpdate(params.documentId, requests);

      return json({
        appended: params.paragraphs.length,
        endIndex: cursor,
        url: documentUrl(params.documentId),
      });
    });
  }

  async replaceAllText(params: ReplaceAllTextParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const requests = params.replacements.map((replacement) => ({
        replaceAllText: {
          containsText: { text: replacement.find, matchCase: replacement.matchCase },
          replaceText: replacement.replace,
        },
      }));

      const result = await this.client.batchUpdate(params.documentId, requests);

      return json({
        replacements: params.replacements.map((replacement, index) => ({
          find: replacement.find,
          occurrencesChanged:
            (result.replies?.[index]?.replaceAllText as { occurrencesChanged?: number } | undefined)
              ?.occurrencesChanged || 0,
        })),
        url: documentUrl(params.documentId),
      });
    });
  }

  async deleteRange(params: DeleteRangeParams): Promise<McpToolResult> {
    return this.guard(async () => {
      assertRange(params.startIndex, params.endIndex);

      await this.client.batchUpdate(params.documentId, [
        {
          deleteContentRange: {
            range: {
              startIndex: params.startIndex,
              endIndex: params.endIndex,
              ...(params.segmentId ? { segmentId: params.segmentId } : {}),
            },
          },
        },
      ]);

      return json({
        deleted: params.endIndex - params.startIndex,
        url: documentUrl(params.documentId),
      });
    });
  }

  async formatText(params: FormatTextParams): Promise<McpToolResult> {
    return this.guard(async () => {
      assertRange(params.startIndex, params.endIndex);

      const textStyle: Record<string, unknown> = {};
      const fields: string[] = [];

      if (params.bold !== undefined) {
        textStyle.bold = params.bold;
        fields.push("bold");
      }
      if (params.italic !== undefined) {
        textStyle.italic = params.italic;
        fields.push("italic");
      }
      if (params.underline !== undefined) {
        textStyle.underline = params.underline;
        fields.push("underline");
      }
      if (params.strikethrough !== undefined) {
        textStyle.strikethrough = params.strikethrough;
        fields.push("strikethrough");
      }
      if (params.fontSizePt !== undefined) {
        textStyle.fontSize = { magnitude: params.fontSizePt, unit: "PT" };
        fields.push("fontSize");
      }
      if (params.fontFamily !== undefined) {
        textStyle.weightedFontFamily = { fontFamily: params.fontFamily };
        fields.push("weightedFontFamily");
      }
      if (params.foregroundColor !== undefined) {
        textStyle.foregroundColor = { color: { rgbColor: hexToRgb(params.foregroundColor) } };
        fields.push("foregroundColor");
      }
      if (params.backgroundColor !== undefined) {
        textStyle.backgroundColor = { color: { rgbColor: hexToRgb(params.backgroundColor) } };
        fields.push("backgroundColor");
      }
      if (params.linkUrl !== undefined) {
        textStyle.link = { url: params.linkUrl };
        fields.push("link");
      }

      if (fields.length === 0) {
        throw new GoogleDocsMCPError("Nothing to change — pass at least one style", "INVALID_PARAMS");
      }

      await this.client.batchUpdate(params.documentId, [
        {
          updateTextStyle: {
            range: {
              startIndex: params.startIndex,
              endIndex: params.endIndex,
              ...(params.segmentId ? { segmentId: params.segmentId } : {}),
            },
            textStyle,
            fields: fields.join(","),
          },
        },
      ]);

      return json({ styled: fields, url: documentUrl(params.documentId) });
    });
  }

  async formatParagraph(params: FormatParagraphParams): Promise<McpToolResult> {
    return this.guard(async () => {
      assertRange(params.startIndex, params.endIndex);

      const range = {
        startIndex: params.startIndex,
        endIndex: params.endIndex,
        ...(params.segmentId ? { segmentId: params.segmentId } : {}),
      };

      const paragraphStyle: Record<string, unknown> = {};
      const fields: string[] = [];

      if (params.style !== undefined) {
        paragraphStyle.namedStyleType = params.style;
        fields.push("namedStyleType");
      }
      if (params.alignment !== undefined) {
        paragraphStyle.alignment = params.alignment;
        fields.push("alignment");
      }
      if (params.indentStartPt !== undefined) {
        paragraphStyle.indentStart = { magnitude: params.indentStartPt, unit: "PT" };
        fields.push("indentStart");
      }
      if (params.spaceAbovePt !== undefined) {
        paragraphStyle.spaceAbove = { magnitude: params.spaceAbovePt, unit: "PT" };
        fields.push("spaceAbove");
      }
      if (params.spaceBelowPt !== undefined) {
        paragraphStyle.spaceBelow = { magnitude: params.spaceBelowPt, unit: "PT" };
        fields.push("spaceBelow");
      }

      const requests: Record<string, unknown>[] = [];
      if (fields.length > 0) {
        requests.push({ updateParagraphStyle: { range, paragraphStyle, fields: fields.join(",") } });
      }
      if (params.removeBullets) {
        requests.push({ deleteParagraphBullets: { range } });
      }
      if (params.bullets !== undefined) {
        requests.push({ createParagraphBullets: { range, bulletPreset: params.bullets } });
      }

      if (requests.length === 0) {
        throw new GoogleDocsMCPError(
          "Nothing to change — pass a style, an alignment, spacing or bullets",
          "INVALID_PARAMS"
        );
      }

      await this.client.batchUpdate(params.documentId, requests);

      return json({
        styled: fields,
        bullets: params.bullets,
        bulletsRemoved: params.removeBullets,
        url: documentUrl(params.documentId),
      });
    });
  }

  async insertTable(params: InsertTableParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const index = params.index ?? (await this.appendIndex(params.documentId));

      await this.client.batchUpdate(params.documentId, [
        {
          insertTable: {
            rows: params.rows,
            columns: params.columns,
            location: { index },
          },
        },
      ]);

      const filledCells = params.values
        ? await this.fillTable(params.documentId, index, params.values)
        : 0;

      return json({
        insertedAt: index,
        rows: params.rows,
        columns: params.columns,
        filledCells,
        url: documentUrl(params.documentId),
      });
    });
  }

  async insertImage(params: InsertImageParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const index = params.index ?? (await this.appendIndex(params.documentId));
      const objectSize =
        params.widthPt && params.heightPt
          ? {
              width: { magnitude: params.widthPt, unit: "PT" },
              height: { magnitude: params.heightPt, unit: "PT" },
            }
          : undefined;

      const result = await this.client.batchUpdate(params.documentId, [
        {
          insertInlineImage: {
            uri: params.imageUrl,
            location: { index },
            ...(objectSize ? { objectSize } : {}),
          },
        },
      ]);

      return json({
        insertedAt: index,
        objectId: (result.replies?.[0]?.insertInlineImage as { objectId?: string } | undefined)
          ?.objectId,
        url: documentUrl(params.documentId),
      });
    });
  }

  async insertPageBreak(params: InsertPageBreakParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const index = params.index ?? (await this.appendIndex(params.documentId));

      await this.client.batchUpdate(params.documentId, [
        { insertPageBreak: { location: { index } } },
      ]);

      return json({ insertedAt: index, url: documentUrl(params.documentId) });
    });
  }

  async batchUpdate(params: BatchUpdateParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.batchUpdate(
        params.documentId,
        params.requests as Record<string, unknown>[]
      );
      return json({
        applied: params.requests.length,
        replies: result.replies,
        url: documentUrl(params.documentId),
      });
    });
  }

  async exportDocument(params: ExportDocumentParams): Promise<McpToolResult> {
    return this.guard(async () => {
      if (params.destinationPath && !this.options.allowLocalWrites) {
        throw new GoogleDocsMCPError(
          "destinationPath is only available when the server runs locally over stdio",
          "INVALID_PARAMS"
        );
      }

      const bytes = await this.client.exportFile(
        params.documentId,
        EXPORT_MIME_TYPES[params.format]
      );

      if (params.destinationPath) {
        const { isAbsolute } = await import("node:path");
        if (!isAbsolute(params.destinationPath)) {
          throw new GoogleDocsMCPError("destinationPath must be an absolute path", "INVALID_PARAMS");
        }
        const { writeFile } = await import("node:fs/promises");
        await writeFile(params.destinationPath, bytes);
        return json({ format: params.format, bytes: bytes.length, path: params.destinationPath });
      }

      if (params.format === "txt" || params.format === "md" || params.format === "html") {
        return {
          content: [{ type: "text" as const, text: bytes.toString("utf-8").slice(0, 200_000) }],
        };
      }

      return json({
        format: params.format,
        bytes: bytes.length,
        note: "Binary export not returned inline. Pass destinationPath when running locally, or open the document URL.",
        url: documentUrl(params.documentId),
      });
    });
  }

  private async appendIndex(documentId: string): Promise<number> {
    const document = await this.client.getDocument(documentId, "body.content.endIndex");
    return bodyEndIndex(document);
  }

  private async fillTable(
    documentId: string,
    insertedAtIndex: number,
    values: string[][]
  ): Promise<number> {
    const document = await this.client.getDocument(documentId);
    const table = (document.body?.content || [])
      .filter((element) => element.table && (element.startIndex ?? 0) >= insertedAtIndex)
      .sort((a, b) => (a.startIndex ?? 0) - (b.startIndex ?? 0))[0];
    const tableRows = table?.table?.tableRows;

    if (!tableRows) {
      throw new GoogleDocsMCPError(
        "Table was created but could not be located to fill its cells",
        "NOT_FOUND"
      );
    }

    const insertions: { index: number; text: string }[] = [];

    tableRows.forEach((row, rowIndex) => {
      (row.tableCells || []).forEach((cell, columnIndex) => {
        const text = values[rowIndex]?.[columnIndex];
        if (!text) return;
        insertions.push({ index: cellInsertIndex(cell), text });
      });
    });

    if (insertions.length === 0) return 0;

    const requests = insertions
      .sort((a, b) => b.index - a.index)
      .map((insertion) => ({
        insertText: { text: insertion.text, location: { index: insertion.index } },
      }));

    await this.client.batchUpdate(documentId, requests);
    return insertions.length;
  }

  private async guard(action: () => Promise<McpToolResult>): Promise<McpToolResult> {
    try {
      return await action();
    } catch (error) {
      const message =
        error instanceof GoogleDocsMCPError
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

export interface OutlineBlock {
  startIndex?: number;
  endIndex?: number;
  type: string;
  style?: string;
  bulleted?: boolean;
  text?: string;
  rows?: number;
  columns?: number;
  cells?: { startIndex: number; text: string }[];
}

export function outlineBlocks(
  content: StructuralElement[],
  options: { includeTables: boolean; includeText: boolean }
): OutlineBlock[] {
  const blocks: OutlineBlock[] = [];

  for (const element of content) {
    if (element.paragraph) {
      const text = paragraphText(element.paragraph);
      blocks.push({
        startIndex: element.startIndex,
        endIndex: element.endIndex,
        type: element.paragraph.bullet ? "listItem" : "paragraph",
        style: element.paragraph.paragraphStyle?.namedStyleType,
        ...(element.paragraph.bullet ? { bulleted: true } : {}),
        ...(options.includeText ? { text } : {}),
      });
      continue;
    }

    if (element.table) {
      if (!options.includeTables) continue;
      const cells: { startIndex: number; text: string }[] = [];
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          cells.push({
            startIndex: cellInsertIndex(cell),
            text: options.includeText ? structuralText(cell.content || []) : "",
          });
        }
      }
      blocks.push({
        startIndex: element.startIndex,
        endIndex: element.endIndex,
        type: "table",
        rows: element.table.rows,
        columns: element.table.columns,
        cells,
      });
      continue;
    }

    if (element.tableOfContents) {
      blocks.push({
        startIndex: element.startIndex,
        endIndex: element.endIndex,
        type: "tableOfContents",
      });
      continue;
    }

    if (element.sectionBreak) {
      blocks.push({
        startIndex: element.startIndex,
        endIndex: element.endIndex,
        type: "sectionBreak",
      });
    }
  }

  return blocks;
}

export function cellInsertIndex(cell: TableCell): number {
  const firstParagraph = cell.content?.[0]?.startIndex;
  return firstParagraph ?? (cell.startIndex ?? 0) + 1;
}

export function paragraphText(paragraph: Paragraph): string {
  return (paragraph.elements || [])
    .map((element) => {
      if (element.textRun?.content) return element.textRun.content;
      if (element.inlineObjectElement) return "[image]";
      if (element.pageBreak) return "[page break]";
      if (element.horizontalRule) return "[rule]";
      return "";
    })
    .join("")
    .replace(/\n+$/, "");
}

export function structuralText(content: StructuralElement[]): string {
  return content
    .map((element) => (element.paragraph ? paragraphText(element.paragraph) : ""))
    .filter(Boolean)
    .join("\n");
}

export function bodyEndIndex(document: Document): number {
  const content = document.body?.content || [];
  const last = content[content.length - 1];
  const endIndex = last?.endIndex ?? 2;
  return Math.max(1, endIndex - 1);
}

export function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const value = hex.replace(/^#/, "");
  return {
    red: parseInt(value.slice(0, 2), 16) / 255,
    green: parseInt(value.slice(2, 4), 16) / 255,
    blue: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function assertRange(startIndex: number, endIndex: number): void {
  if (endIndex <= startIndex) {
    throw new GoogleDocsMCPError(
      `endIndex (${endIndex}) must be greater than startIndex (${startIndex})`,
      "INVALID_PARAMS"
    );
  }
}

function documentUrl(documentId: string): string {
  return `https://docs.google.com/document/d/${documentId}/edit`;
}

function json(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
