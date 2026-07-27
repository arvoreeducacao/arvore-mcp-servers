import { refreshAccessToken } from "./oauth.js";
import {
  DriveFile,
  GoogleSlidesClientConfig,
  GoogleSlidesMCPError,
  Page,
  Presentation,
} from "./types.js";

const SLIDES_API = "https://slides.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_SKEW_MS = 60_000;

export class GoogleSlidesClient {
  private config: GoogleSlidesClientConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(config: GoogleSlidesClientConfig) {
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
    const url = new URL(`${baseUrl}${path}`);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(new URL(baseUrl).pathname)) {
      throw new GoogleSlidesMCPError(`Refusing to call ${url.toString()}`, "INVALID_PARAMS");
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
      throw new GoogleSlidesMCPError(
        `Google API error ${response.status}: ${detail.slice(0, 1200)}`,
        response.status === 404 ? "NOT_FOUND" : "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async getPresentation(presentationId: string, fields?: string): Promise<Presentation> {
    return this.request<Presentation>(SLIDES_API, `/presentations/${encodeURIComponent(presentationId)}`, {
      query: { fields },
    });
  }

  async createPresentation(title: string): Promise<Presentation> {
    return this.request<Presentation>(SLIDES_API, "/presentations", {
      method: "POST",
      body: { title },
    });
  }

  async getPage(presentationId: string, pageObjectId: string): Promise<Page> {
    return this.request<Page>(
      SLIDES_API,
      `/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageObjectId)}`
    );
  }

  async batchUpdate(
    presentationId: string,
    requests: Record<string, unknown>[]
  ): Promise<{ replies?: Record<string, unknown>[]; presentationId?: string }> {
    return this.request(SLIDES_API, `/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
      method: "POST",
      body: { requests },
    });
  }

  async getThumbnailUrl(
    presentationId: string,
    pageObjectId: string,
    size: string
  ): Promise<{ contentUrl: string; width: number; height: number }> {
    return this.request(
      SLIDES_API,
      `/presentations/${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageObjectId)}/thumbnail`,
      {
        query: {
          "thumbnailProperties.mimeType": "PNG",
          "thumbnailProperties.thumbnailSize": size,
        },
      }
    );
  }

  async fetchImage(contentUrl: string): Promise<Buffer> {
    const response = await fetch(contentUrl);
    if (!response.ok) {
      throw new GoogleSlidesMCPError(
        `Thumbnail download failed: ${response.status}`,
        "API_ERROR",
        response.status
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async listPresentations(params: {
    nameContains?: string;
    folderId?: string;
    limit: number;
    includeSharedDrives: boolean;
  }): Promise<DriveFile[]> {
    const clauses = [
      "mimeType='application/vnd.google-apps.presentation'",
      "trashed=false",
    ];
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

  async copyFile(
    fileId: string,
    name: string,
    parentFolderId?: string
  ): Promise<DriveFile> {
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

  async exportFile(fileId: string, mimeType: string): Promise<Buffer> {
    const token = await this.token();
    const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/export`);
    url.searchParams.set("mimeType", mimeType);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new GoogleSlidesMCPError(
        `Export failed: ${response.status} ${await response.text()}`,
        "API_ERROR",
        response.status
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
