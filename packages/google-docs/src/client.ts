import { refreshAccessToken } from "./oauth.js";
import { Document, DriveFile, GoogleDocsClientConfig, GoogleDocsMCPError } from "./types.js";

const DOCS_API = "https://docs.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DOCUMENT_MIME_TYPE = "application/vnd.google-apps.document";
const MARKDOWN_MIME_TYPE = "text/markdown";
const TOKEN_SKEW_MS = 60_000;

export class GoogleDocsClient {
  private config: GoogleDocsClientConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(config: GoogleDocsClientConfig) {
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
    init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}
  ): Promise<T> {
    const base = new URL(baseUrl);
    const url = new URL(`${baseUrl}${path}`);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new GoogleDocsMCPError(`Refusing to call ${url.toString()}`, "INVALID_PARAMS");
    }
    for (const [key, value] of Object.entries(init.query || {})) {
      if (value !== undefined) url.searchParams.set(key, value);
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
      throw new GoogleDocsMCPError(
        `Google API error ${response.status}: ${detail.slice(0, 1200)}`,
        response.status === 404 ? "NOT_FOUND" : "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async getDocument(documentId: string, fields?: string): Promise<Document> {
    return this.request<Document>(DOCS_API, `/documents/${encodeURIComponent(documentId)}`, {
      query: { fields },
    });
  }

  async createDocument(title: string): Promise<Document> {
    return this.request<Document>(DOCS_API, "/documents", {
      method: "POST",
      body: { title },
    });
  }

  async batchUpdate(
    documentId: string,
    requests: Record<string, unknown>[]
  ): Promise<{ replies?: Record<string, unknown>[]; documentId?: string }> {
    return this.request(DOCS_API, `/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
      method: "POST",
      body: { requests },
    });
  }

  async listDocuments(params: {
    nameContains?: string;
    folderId?: string;
    limit: number;
    includeSharedDrives: boolean;
  }): Promise<DriveFile[]> {
    const clauses = [`mimeType='${DOCUMENT_MIME_TYPE}'`, "trashed=false"];
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
    const current = await this.request<DriveFile>(DRIVE_API, `/files/${encodeURIComponent(fileId)}`, {
      query: { fields: "parents", supportsAllDrives: "true" },
    });

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

  async createFromMarkdown(
    name: string,
    markdown: string,
    parentFolderId?: string
  ): Promise<DriveFile> {
    const metadata = {
      name,
      mimeType: DOCUMENT_MIME_TYPE,
      ...(parentFolderId ? { parents: [parentFolderId] } : {}),
    };

    const url = new URL(`${DRIVE_UPLOAD_API}/files`);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("fields", "id,name,webViewLink,parents");

    const boundary = `arvore-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${MARKDOWN_MIME_TYPE}; charset=UTF-8\r\n\r\n` +
      `${markdown}\r\n` +
      `--${boundary}--`;

    return this.upload<DriveFile>(url, "POST", `multipart/related; boundary=${boundary}`, body);
  }

  async overwriteFromMarkdown(fileId: string, markdown: string): Promise<DriveFile> {
    const url = new URL(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("uploadType", "media");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("fields", "id,name,webViewLink");

    return this.upload<DriveFile>(
      url,
      "PATCH",
      `${MARKDOWN_MIME_TYPE}; charset=UTF-8`,
      markdown
    );
  }

  private async upload<T>(
    url: URL,
    method: string,
    contentType: string,
    body: string
  ): Promise<T> {
    const token = await this.token();
    const response = await fetch(url.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleDocsMCPError(
        `Drive upload failed: ${response.status} ${detail.slice(0, 1200)}`,
        response.status === 404 ? "NOT_FOUND" : "API_ERROR",
        response.status
      );
    }

    return (await response.json()) as T;
  }

  async exportFile(fileId: string, mimeType: string): Promise<Buffer> {
    const token = await this.token();
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export`);
    url.searchParams.set("mimeType", mimeType);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new GoogleDocsMCPError(
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
