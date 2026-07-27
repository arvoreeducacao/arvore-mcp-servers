import { GoogleSlidesClient } from "./client.js";
import {
  AddSlideParams,
  BatchUpdateParams,
  CopyPresentationParams,
  CreatePresentationParams,
  DeleteObjectParams,
  ExportPresentationParams,
  GetPageParams,
  GetPresentationParams,
  GetSlideImageParams,
  GoogleSlidesMCPError,
  InsertImageParams,
  InsertTextParams,
  ListPresentationsParams,
  McpToolResult,
  Page,
  PageElement,
  ReplaceAllTextParams,
  SetSpeakerNotesParams,
  SummarizePresentationParams,
} from "./types.js";

const EXPORT_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

const PLACEHOLDER_TARGETS: Record<string, string[]> = {
  title: ["TITLE", "CENTERED_TITLE"],
  subtitle: ["SUBTITLE"],
  body: ["BODY"],
};

export class GoogleSlidesMCPTools {
  constructor(private client: GoogleSlidesClient) {}

  async listPresentations(params: ListPresentationsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const files = await this.client.listPresentations(params);
      return json({
        count: files.length,
        presentations: files.map((file) => ({
          presentationId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          owner: file.owners?.[0]?.emailAddress,
          webViewLink: file.webViewLink,
        })),
      });
    });
  }

  async createPresentation(params: CreatePresentationParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const presentation = await this.client.createPresentation(params.title);
      if (params.folderId) {
        await this.client.moveFile(presentation.presentationId, params.folderId);
      }
      return json({
        presentationId: presentation.presentationId,
        title: presentation.title,
        firstSlideObjectId: presentation.slides?.[0]?.objectId,
        url: presentationUrl(presentation.presentationId),
      });
    });
  }

  async copyPresentation(params: CopyPresentationParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const copy = await this.client.copyFile(
        params.presentationId,
        params.title,
        params.folderId
      );
      return json({
        presentationId: copy.id,
        title: copy.name,
        url: presentationUrl(copy.id),
      });
    });
  }

  async getPresentation(params: GetPresentationParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const presentation = await this.client.getPresentation(
        params.presentationId,
        params.fields
      );
      return json(presentation);
    });
  }

  async getPage(params: GetPageParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const pageObjectId = await this.resolvePageId(params.presentationId, params);
      const page = await this.client.getPage(params.presentationId, pageObjectId);
      return json(page);
    });
  }

  async summarizePresentation(
    params: SummarizePresentationParams
  ): Promise<McpToolResult> {
    return this.guard(async () => {
      const presentation = await this.client.getPresentation(params.presentationId);
      const slides = (presentation.slides || []).map((slide, index) => {
        const elements = collectTextElements(slide.pageElements || []);
        const notes = params.includeNotes ? speakerNotesText(slide) : undefined;

        return {
          index,
          pageObjectId: slide.objectId,
          layoutObjectId: slide.slideProperties?.layoutObjectId,
          elements: elements.map((element) => ({
            ...(params.includeObjectIds ? { objectId: element.objectId } : {}),
            placeholder: element.placeholder,
            text: element.text,
          })),
          ...(notes !== undefined ? { speakerNotes: notes } : {}),
        };
      });

      return json({
        presentationId: presentation.presentationId,
        title: presentation.title,
        slideCount: slides.length,
        pageSizePt: {
          width: presentation.pageSize?.width?.magnitude,
          height: presentation.pageSize?.height?.magnitude,
        },
        url: presentationUrl(presentation.presentationId),
        slides,
      });
    });
  }

  async getSlideImage(params: GetSlideImageParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const pageObjectId = await this.resolvePageId(params.presentationId, params);
      const thumbnail = await this.client.getThumbnailUrl(
        params.presentationId,
        pageObjectId,
        params.size
      );
      const bytes = await this.client.fetchImage(thumbnail.contentUrl);

      return {
        content: [
          {
            type: "text" as const,
            text: `Slide ${pageObjectId} — ${thumbnail.width}x${thumbnail.height}px (${params.size})`,
          },
          {
            type: "image" as const,
            data: bytes.toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    });
  }

  async batchUpdate(params: BatchUpdateParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const result = await this.client.batchUpdate(
        params.presentationId,
        params.requests as Record<string, unknown>[]
      );
      return json({
        applied: params.requests.length,
        replies: result.replies,
        url: presentationUrl(params.presentationId),
      });
    });
  }

  async addSlide(params: AddSlideParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const created = await this.client.batchUpdate(params.presentationId, [
        {
          createSlide: {
            ...(params.insertionIndex !== undefined
              ? { insertionIndex: params.insertionIndex }
              : {}),
            slideLayoutReference: { predefinedLayout: params.layout },
          },
        },
      ]);

      const pageObjectId = (
        created.replies?.[0]?.createSlide as { objectId?: string } | undefined
      )?.objectId;

      if (!pageObjectId) {
        throw new GoogleSlidesMCPError("Slide created but no objectId returned", "API_ERROR");
      }

      const filled = await this.fillPlaceholders(params.presentationId, pageObjectId, {
        title: params.title,
        subtitle: params.subtitle,
        body: params.body,
      });

      return json({
        pageObjectId,
        layout: params.layout,
        filledPlaceholders: filled,
        url: presentationUrl(params.presentationId, pageObjectId),
      });
    });
  }

  async insertText(params: InsertTextParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const requests: Record<string, unknown>[] = [];
      if (params.replaceExisting) {
        requests.push({
          deleteText: {
            objectId: params.objectId,
            textRange: { type: "ALL" },
          },
        });
      }
      requests.push({
        insertText: {
          objectId: params.objectId,
          text: params.text,
          insertionIndex: params.replaceExisting ? 0 : params.insertionIndex,
        },
      });

      await this.client.batchUpdate(params.presentationId, requests);
      return json({
        objectId: params.objectId,
        replaced: params.replaceExisting,
        url: presentationUrl(params.presentationId),
      });
    });
  }

  async replaceAllText(params: ReplaceAllTextParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const requests = params.replacements.map((replacement) => ({
        replaceAllText: {
          containsText: { text: replacement.find, matchCase: replacement.matchCase },
          replaceText: replacement.replace,
          ...(params.pageObjectIds ? { pageObjectIds: params.pageObjectIds } : {}),
        },
      }));

      const result = await this.client.batchUpdate(params.presentationId, requests);
      return json({
        replacements: params.replacements.map((replacement, index) => ({
          find: replacement.find,
          occurrencesChanged:
            (result.replies?.[index]?.replaceAllText as
              | { occurrencesChanged?: number }
              | undefined)?.occurrencesChanged || 0,
        })),
        url: presentationUrl(params.presentationId),
      });
    });
  }

  async insertImage(params: InsertImageParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const pageObjectId = await this.resolvePageId(params.presentationId, params);
      const size =
        params.widthPt && params.heightPt
          ? {
              width: { magnitude: params.widthPt, unit: "PT" },
              height: { magnitude: params.heightPt, unit: "PT" },
            }
          : undefined;

      const result = await this.client.batchUpdate(params.presentationId, [
        {
          createImage: {
            url: params.imageUrl,
            elementProperties: {
              pageObjectId,
              ...(size ? { size } : {}),
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: params.xPt,
                translateY: params.yPt,
                unit: "PT",
              },
            },
          },
        },
      ]);

      return json({
        pageObjectId,
        imageObjectId: (result.replies?.[0]?.createImage as { objectId?: string })?.objectId,
        url: presentationUrl(params.presentationId, pageObjectId),
      });
    });
  }

  async deleteObject(params: DeleteObjectParams): Promise<McpToolResult> {
    return this.guard(async () => {
      await this.client.batchUpdate(params.presentationId, [
        { deleteObject: { objectId: params.objectId } },
      ]);
      return json({ deleted: params.objectId });
    });
  }

  async setSpeakerNotes(params: SetSpeakerNotesParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const pageObjectId = await this.resolvePageId(params.presentationId, params);
      const page = await this.client.getPage(params.presentationId, pageObjectId);
      const notesObjectId =
        page.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;

      if (!notesObjectId) {
        throw new GoogleSlidesMCPError(
          `Slide ${pageObjectId} has no speaker notes shape`,
          "NOT_FOUND"
        );
      }

      const existing = speakerNotesText(page);
      const requests: Record<string, unknown>[] = [];
      if (existing) {
        requests.push({
          deleteText: { objectId: notesObjectId, textRange: { type: "ALL" } },
        });
      }
      requests.push({
        insertText: { objectId: notesObjectId, text: params.text, insertionIndex: 0 },
      });

      await this.client.batchUpdate(params.presentationId, requests);
      return json({ pageObjectId, speakerNotesObjectId: notesObjectId });
    });
  }

  async exportPresentation(params: ExportPresentationParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const mimeType = EXPORT_MIME_TYPES[params.format];
      const bytes = await this.client.exportFile(params.presentationId, mimeType);

      if (params.destinationPath) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(params.destinationPath, bytes);
        return json({
          format: params.format,
          bytes: bytes.length,
          path: params.destinationPath,
        });
      }

      if (params.format === "txt") {
        return {
          content: [{ type: "text" as const, text: bytes.toString("utf-8").slice(0, 100_000) }],
        };
      }

      return json({
        format: params.format,
        bytes: bytes.length,
        note: "Binary export not returned inline. Pass destinationPath when running locally, or open the presentation URL.",
        url: presentationUrl(params.presentationId),
      });
    });
  }

  private async fillPlaceholders(
    presentationId: string,
    pageObjectId: string,
    texts: { title?: string; subtitle?: string; body?: string }
  ): Promise<string[]> {
    const wanted = Object.entries(texts).filter(([, value]) => value !== undefined);
    if (wanted.length === 0) return [];

    const page = await this.client.getPage(presentationId, pageObjectId);
    const elements = collectTextElements(page.pageElements || []);
    const requests: Record<string, unknown>[] = [];
    const filled: string[] = [];

    for (const [key, value] of wanted) {
      const accepted = PLACEHOLDER_TARGETS[key] || [];
      const target = elements.find(
        (element) => element.placeholder && accepted.includes(element.placeholder)
      );
      if (!target) continue;

      if (target.text) {
        requests.push({
          deleteText: { objectId: target.objectId, textRange: { type: "ALL" } },
        });
      }
      requests.push({
        insertText: { objectId: target.objectId, text: value as string, insertionIndex: 0 },
      });
      filled.push(`${key}:${target.objectId}`);
    }

    if (requests.length > 0) {
      await this.client.batchUpdate(presentationId, requests);
    }

    return filled;
  }

  private async resolvePageId(
    presentationId: string,
    params: { pageObjectId?: string; slideIndex?: number }
  ): Promise<string> {
    if (params.pageObjectId) return params.pageObjectId;

    if (params.slideIndex === undefined) {
      throw new GoogleSlidesMCPError(
        "Provide either pageObjectId or slideIndex",
        "INVALID_PARAMS"
      );
    }

    const presentation = await this.client.getPresentation(
      presentationId,
      "slides.objectId"
    );
    const slide = presentation.slides?.[params.slideIndex];
    if (!slide) {
      throw new GoogleSlidesMCPError(
        `Slide index ${params.slideIndex} out of range (${presentation.slides?.length || 0} slides)`,
        "NOT_FOUND"
      );
    }

    return slide.objectId;
  }

  private async guard(action: () => Promise<McpToolResult>): Promise<McpToolResult> {
    try {
      return await action();
    } catch (error) {
      const message =
        error instanceof GoogleSlidesMCPError
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

interface FlatTextElement {
  objectId: string;
  placeholder?: string;
  text: string;
}

function collectTextElements(elements: PageElement[]): FlatTextElement[] {
  const flat: FlatTextElement[] = [];

  for (const element of elements) {
    if (element.elementGroup?.children) {
      flat.push(...collectTextElements(element.elementGroup.children));
      continue;
    }

    if (element.shape) {
      flat.push({
        objectId: element.objectId,
        placeholder: element.shape.placeholder?.type,
        text: textFromElements(element.shape.text?.textElements),
      });
      continue;
    }

    if (element.table?.tableRows) {
      element.table.tableRows.forEach((row, rowIndex) => {
        (row.tableCells || []).forEach((cell, columnIndex) => {
          flat.push({
            objectId: `${element.objectId}:r${rowIndex}c${columnIndex}`,
            text: textFromElements(cell.text?.textElements),
          });
        });
      });
      continue;
    }

    if (element.image) {
      flat.push({
        objectId: element.objectId,
        text: `[image${element.description ? `: ${element.description}` : ""}]`,
      });
    }
  }

  return flat;
}

function textFromElements(
  textElements?: { textRun?: { content?: string } }[]
): string {
  return (textElements || [])
    .map((textElement) => textElement.textRun?.content || "")
    .join("")
    .trim();
}

function speakerNotesText(page: Page): string {
  const notesPage = page.slideProperties?.notesPage;
  const notesObjectId = notesPage?.notesProperties?.speakerNotesObjectId;
  const shape = (notesPage?.pageElements || []).find(
    (element) => element.objectId === notesObjectId
  );
  return textFromElements(shape?.shape?.text?.textElements);
}

function presentationUrl(presentationId: string, pageObjectId?: string): string {
  const base = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  return pageObjectId ? `${base}#slide=id.${pageObjectId}` : base;
}

function json(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
