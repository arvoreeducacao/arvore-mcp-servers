import { refreshAccessToken } from "./oauth.js";
import {
  CellValue,
  DriveFile,
  GoogleSheetsClientConfig,
  GoogleSheetsMCPError,
  Spreadsheet,
  ValueRange,
} from "./types.js";

const SHEETS_API = "https://sheets.googleapis.com/v4";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SPREADSHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const TOKEN_SKEW_MS = 60_000;

export class GoogleSheetsClient {
  private config: GoogleSheetsClientConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(config: GoogleSheetsClientConfig) {
    this.config = config;
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - TOKEN_SKEW_MS) {
      return this.accessToken;
    }

    if (!this.refreshing) {
      this.refreshing = refreshAccessToken({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken: this.config.refreshToken,
      })
        .then((tokens) => {
          this.accessToken = tokens.access_token;
          this.expiresAt = tokens.expires_at;
          return tokens.access_token;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }

    return this.refreshing;
  }

  private async request<T>(
    baseUrl: string,
    path: string,
    init: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | undefined>;
      repeatedQuery?: { key: string; values: string[] };
    } = {}
  ): Promise<T> {
    const base = new URL(baseUrl);
    const url = new URL(`${baseUrl}${path}`);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new GoogleSheetsMCPError(`Refusing to call ${url.toString()}`, "INVALID_PARAMS");
    }
    for (const [key, value] of Object.entries(init.query || {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    if (init.repeatedQuery) {
      for (const value of init.repeatedQuery.values) {
        url.searchParams.append(init.repeatedQuery.key, value);
      }
    }

    const token = await this.token();
    const response = await fetch(url.toString(), {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleSheetsMCPError(
        `Google API error ${response.status}: ${detail.slice(0, 1200)}`,
        response.status === 404 ? "NOT_FOUND" : "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async getSpreadsheet(
    spreadsheetId: string,
    options: { fields?: string; includeGridData?: boolean } = {}
  ): Promise<Spreadsheet> {
    return this.request<Spreadsheet>(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
      {
        query: {
          fields: options.fields,
          includeGridData: options.includeGridData ? "true" : undefined,
        },
      }
    );
  }

  async createSpreadsheet(title: string, sheetTitles?: string[]): Promise<Spreadsheet> {
    return this.request<Spreadsheet>(SHEETS_API, "/spreadsheets", {
      method: "POST",
      body: {
        properties: { title },
        ...(sheetTitles?.length
          ? { sheets: sheetTitles.map((sheetTitle) => ({ properties: { title: sheetTitle } })) }
          : {}),
      },
    });
  }

  async batchUpdate(
    spreadsheetId: string,
    requests: Record<string, unknown>[]
  ): Promise<{ replies?: Record<string, unknown>[]; spreadsheetId?: string }> {
    return this.request(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      { method: "POST", body: { requests } }
    );
  }

  async batchGetValues(
    spreadsheetId: string,
    ranges: string[],
    options: { valueRenderOption: string; majorDimension: string }
  ): Promise<{ valueRanges?: ValueRange[] }> {
    return this.request(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`,
      {
        query: {
          valueRenderOption: options.valueRenderOption,
          majorDimension: options.majorDimension,
        },
        repeatedQuery: { key: "ranges", values: ranges },
      }
    );
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: CellValue[][],
    options: { valueInputOption: string; majorDimension: string }
  ): Promise<{ updatedRange?: string; updatedCells?: number; updatedRows?: number }> {
    return this.request(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
      {
        method: "PUT",
        query: { valueInputOption: options.valueInputOption },
        body: { range, majorDimension: options.majorDimension, values },
      }
    );
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: CellValue[][],
    options: { valueInputOption: string; insertDataOption: string }
  ): Promise<{ updates?: { updatedRange?: string; updatedRows?: number; updatedCells?: number } }> {
    return this.request(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
      {
        method: "POST",
        query: {
          valueInputOption: options.valueInputOption,
          insertDataOption: options.insertDataOption,
        },
        body: { values },
      }
    );
  }

  async clearValues(
    spreadsheetId: string,
    range: string
  ): Promise<{ clearedRange?: string }> {
    return this.request(
      SHEETS_API,
      `/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:clear`,
      { method: "POST", body: {} }
    );
  }

  async listSpreadsheets(params: {
    nameContains?: string;
    folderId?: string;
    limit: number;
    includeSharedDrives: boolean;
  }): Promise<DriveFile[]> {
    const clauses = [`mimeType='${SPREADSHEET_MIME_TYPE}'`, "trashed=false"];
    if (params.nameContains) {
      clauses.push(`name contains '${escapeDriveQuery(params.nameContains)}'`);
    }
    if (params.folderId) {
      clauses.push(`'${escapeDriveQuery(params.folderId)}' in parents`);
    }

    const result = await this.request<{ files?: DriveFile[] }>(DRIVE_API, "/files", {
      query: {
        q: clauses.join(" and "),
        pageSize: String(params.limit),
        orderBy: "modifiedTime desc",
        fields: "files(id,name,mimeType,webViewLink,modifiedTime,owners(emailAddress),parents)",
        supportsAllDrives: params.includeSharedDrives ? "true" : undefined,
        includeItemsFromAllDrives: params.includeSharedDrives ? "true" : undefined,
      },
    });

    return result.files || [];
  }

  async copyFile(fileId: string, name: string, parentFolderId?: string): Promise<DriveFile> {
    return this.request<DriveFile>(DRIVE_API, `/files/${encodeURIComponent(fileId)}/copy`, {
      method: "POST",
      body: { name, ...(parentFolderId ? { parents: [parentFolderId] } : {}) },
      query: { supportsAllDrives: "true", fields: "id,name,webViewLink,parents" },
    });
  }

  async moveFile(fileId: string, folderId: string): Promise<DriveFile> {
    const current = await this.request<DriveFile>(
      DRIVE_API,
      `/files/${encodeURIComponent(fileId)}`,
      { query: { fields: "parents", supportsAllDrives: "true" } }
    );

    return this.request<DriveFile>(DRIVE_API, `/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      query: {
        addParents: folderId,
        removeParents: (current.parents || []).join(","),
        supportsAllDrives: "true",
        fields: "id,name,webViewLink,parents",
      },
    });
  }

  async exportFile(fileId: string, mimeType: string): Promise<Buffer> {
    const token = await this.token();
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export`);
    url.searchParams.set("mimeType", mimeType);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new GoogleSheetsMCPError(
        `Export failed: ${response.status} ${await response.text()}`,
        "API_ERROR",
        response.status
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
