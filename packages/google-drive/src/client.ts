import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { TokenStore } from "./token-store.js";
import { refreshAccessToken } from "./oauth.js";
import {
  DriveFile,
  GoogleDriveClientConfig,
  GoogleDriveMCPError,
  OAuthCredentials,
} from "./types.js";

const API_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

const DEFAULT_FILE_FIELDS = [
  "id",
  "name",
  "mimeType",
  "parents",
  "trashed",
  "starred",
  "size",
  "createdTime",
  "modifiedTime",
  "webViewLink",
  "webContentLink",
  "iconLink",
  "owners(displayName,emailAddress)",
  "lastModifyingUser(displayName,emailAddress)",
  "shared",
  "description",
  "driveId",
  "md5Checksum",
  "fileExtension",
].join(",");

export class GoogleDriveClient {
  private config: GoogleDriveClientConfig;
  private tokenStore: TokenStore;
  private cachedCredentials: OAuthCredentials | null = null;
  private supportsAllDrives: boolean;

  constructor(config: GoogleDriveClientConfig) {
    this.config = config;
    this.tokenStore = new TokenStore(config.configDir);
    this.supportsAllDrives = config.supportsAllDrives ?? true;
  }

  private async loadCredentials(): Promise<OAuthCredentials> {
    if (this.cachedCredentials) return this.cachedCredentials;

    if (this.config.refreshToken) {
      this.cachedCredentials = {
        access_token: "",
        refresh_token: this.config.refreshToken,
        expires_at: 0,
        scope: "",
        token_type: "Bearer",
      };
      return this.cachedCredentials;
    }

    const stored = await this.tokenStore.load();
    if (!stored) {
      throw new GoogleDriveMCPError(
        "No credentials found. Run `google-drive-mcp auth login` first or set GDRIVE_MCP_REFRESH_TOKEN.",
        "AUTH_ERROR"
      );
    }

    this.cachedCredentials = stored;
    return stored;
  }

  private async getAccessToken(): Promise<string> {
    const creds = await this.loadCredentials();

    if (creds.access_token && Date.now() < creds.expires_at - 60_000) {
      return creds.access_token;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new GoogleDriveMCPError(
        "GDRIVE_MCP_CLIENT_ID and GDRIVE_MCP_CLIENT_SECRET are required to refresh tokens",
        "AUTH_ERROR"
      );
    }

    const refreshed = await refreshAccessToken({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      refreshToken: creds.refresh_token,
    });

    const updated: OAuthCredentials = {
      ...creds,
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
      scope: refreshed.scope || creds.scope,
      token_type: refreshed.token_type,
    };

    this.cachedCredentials = updated;

    if (!this.config.refreshToken) {
      await this.tokenStore.save(updated);
    }

    return updated.access_token;
  }

  private buildUrl(
    base: string,
    path: string,
    query?: Record<string, string | string[] | boolean | undefined>
  ): string {
    let url = `${base}${path}`;
    const params = new URLSearchParams();

    if (this.supportsAllDrives) {
      params.set("supportsAllDrives", "true");
    }

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        if (typeof value === "boolean") {
          params.set(key, value ? "true" : "false");
        } else if (Array.isArray(value)) {
          for (const item of value) params.append(key, item);
        } else if (value !== "") {
          params.set(key, value);
        }
      }
    }

    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return url;
  }

  private async requestJson<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | string[] | boolean | undefined>;
      base?: string;
    }
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = this.buildUrl(options?.base || API_BASE, path, options?.query);

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (options?.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleDriveMCPError(
        `Drive API error: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  async getAbout(): Promise<{
    user: { displayName?: string; emailAddress?: string; photoLink?: string };
    storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
  }> {
    return this.requestJson("GET", "/about", {
      query: {
        fields: "user(displayName,emailAddress,photoLink),storageQuota",
      },
    });
  }

  async listFiles(params: {
    query?: string;
    folderId?: string;
    pageSize?: number;
    pageToken?: string;
    orderBy?: string;
    fields?: string;
    includeTrashed?: boolean;
  }): Promise<{
    files: DriveFile[];
    nextPageToken?: string;
    incompleteSearch?: boolean;
  }> {
    const filters: string[] = [];
    if (params.query) filters.push(`(${params.query})`);
    if (params.folderId) filters.push(`'${params.folderId}' in parents`);
    if (!params.includeTrashed) filters.push("trashed = false");

    const fileFields = params.fields || DEFAULT_FILE_FIELDS;

    return this.requestJson("GET", "/files", {
      query: {
        q: filters.length ? filters.join(" and ") : undefined,
        pageSize: params.pageSize?.toString(),
        pageToken: params.pageToken,
        orderBy: params.orderBy,
        fields: `nextPageToken,incompleteSearch,files(${fileFields})`,
        includeItemsFromAllDrives: this.supportsAllDrives,
        corpora: this.supportsAllDrives ? "allDrives" : undefined,
      },
    });
  }

  async getFile(fileId: string, fields?: string): Promise<DriveFile> {
    return this.requestJson("GET", `/files/${encodeURIComponent(fileId)}`, {
      query: {
        fields: fields || DEFAULT_FILE_FIELDS,
      },
    });
  }

  async downloadFile(fileId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
  }> {
    const token = await this.getAccessToken();
    const url = this.buildUrl(API_BASE, `/files/${encodeURIComponent(fileId)}`, {
      alt: "media",
    });

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleDriveMCPError(
        `Drive download failed: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType =
      response.headers.get("content-type") || "application/octet-stream";
    return { buffer, mimeType };
  }

  async exportFile(params: {
    fileId: string;
    mimeType: string;
  }): Promise<{ buffer: Buffer; mimeType: string }> {
    const token = await this.getAccessToken();
    const url = this.buildUrl(
      API_BASE,
      `/files/${encodeURIComponent(params.fileId)}/export`,
      { mimeType: params.mimeType }
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleDriveMCPError(
        `Drive export failed: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType =
      response.headers.get("content-type") || params.mimeType;
    return { buffer, mimeType };
  }

  async uploadFile(params: {
    inputPath: string;
    name?: string;
    mimeType?: string;
    parentFolderId?: string;
    description?: string;
  }): Promise<DriveFile> {
    const stats = statSync(params.inputPath);
    if (!stats.isFile()) {
      throw new GoogleDriveMCPError(
        `inputPath is not a file: ${params.inputPath}`,
        "INVALID_INPUT"
      );
    }

    const fileBytes = await readFile(params.inputPath);
    const filename = params.name || basename(params.inputPath);
    const mimeType =
      params.mimeType || guessMimeType(filename) || "application/octet-stream";

    const metadata: Record<string, unknown> = {
      name: filename,
      mimeType,
    };
    if (params.parentFolderId) metadata.parents = [params.parentFolderId];
    if (params.description) metadata.description = params.description;

    return this.uploadMultipart({
      method: "POST",
      path: "/files",
      metadata,
      contentBytes: fileBytes,
      contentMimeType: mimeType,
    });
  }

  async updateFileContent(params: {
    fileId: string;
    inputPath: string;
    mimeType?: string;
  }): Promise<DriveFile> {
    const fileBytes = await readFile(params.inputPath);
    const mimeType =
      params.mimeType ||
      guessMimeType(params.inputPath) ||
      "application/octet-stream";

    return this.uploadMultipart({
      method: "PATCH",
      path: `/files/${encodeURIComponent(params.fileId)}`,
      metadata: { mimeType },
      contentBytes: fileBytes,
      contentMimeType: mimeType,
    });
  }

  private async uploadMultipart(params: {
    method: "POST" | "PATCH";
    path: string;
    metadata: Record<string, unknown>;
    contentBytes: Buffer;
    contentMimeType: string;
  }): Promise<DriveFile> {
    const token = await this.getAccessToken();
    const url = this.buildUrl(UPLOAD_BASE, params.path, {
      uploadType: "multipart",
      fields: DEFAULT_FILE_FIELDS,
    });

    const boundary = `bnd_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const CRLF = "\r\n";
    const head = Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Type: application/json; charset=UTF-8${CRLF}${CRLF}` +
        `${JSON.stringify(params.metadata)}${CRLF}` +
        `--${boundary}${CRLF}` +
        `Content-Type: ${params.contentMimeType}${CRLF}${CRLF}`,
      "utf-8"
    );
    const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf-8");
    const body = Buffer.concat([head, params.contentBytes, tail]);

    const response = await fetch(url, {
      method: params.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": body.length.toString(),
      },
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new GoogleDriveMCPError(
        `Drive upload failed: ${response.status} ${error}`,
        "API_ERROR",
        response.status
      );
    }

    return response.json() as Promise<DriveFile>;
  }

  async createFolder(params: {
    name: string;
    parentFolderId?: string;
  }): Promise<DriveFile> {
    const body: Record<string, unknown> = {
      name: params.name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (params.parentFolderId) body.parents = [params.parentFolderId];

    return this.requestJson("POST", "/files", {
      body,
      query: { fields: DEFAULT_FILE_FIELDS },
    });
  }

  async moveFile(params: {
    fileId: string;
    newParentFolderId?: string;
    newName?: string;
  }): Promise<DriveFile> {
    const query: Record<string, string | undefined> = {
      fields: DEFAULT_FILE_FIELDS,
    };
    const body: Record<string, unknown> = {};

    if (params.newParentFolderId) {
      const current = await this.getFile(params.fileId, "parents");
      const currentParents = (current.parents || []).join(",");
      query.addParents = params.newParentFolderId;
      if (currentParents) query.removeParents = currentParents;
    }

    if (params.newName) body.name = params.newName;

    return this.requestJson(
      "PATCH",
      `/files/${encodeURIComponent(params.fileId)}`,
      { body, query }
    );
  }

  async trashFile(fileId: string): Promise<DriveFile> {
    return this.requestJson(
      "PATCH",
      `/files/${encodeURIComponent(fileId)}`,
      {
        body: { trashed: true },
        query: { fields: DEFAULT_FILE_FIELDS },
      }
    );
  }

  async deleteFilePermanently(fileId: string): Promise<void> {
    await this.requestJson("DELETE", `/files/${encodeURIComponent(fileId)}`);
  }

  async sharePermission(params: {
    fileId: string;
    role: string;
    type: string;
    emailAddress?: string;
    domain?: string;
    sendNotificationEmail?: boolean;
    emailMessage?: string;
  }): Promise<{
    id: string;
    type: string;
    role: string;
    emailAddress?: string;
    domain?: string;
    displayName?: string;
  }> {
    const body: Record<string, unknown> = {
      role: params.role,
      type: params.type,
    };
    if (params.emailAddress) body.emailAddress = params.emailAddress;
    if (params.domain) body.domain = params.domain;

    return this.requestJson(
      "POST",
      `/files/${encodeURIComponent(params.fileId)}/permissions`,
      {
        body,
        query: {
          sendNotificationEmail: params.sendNotificationEmail,
          emailMessage: params.emailMessage,
          fields: "id,type,role,emailAddress,domain,displayName",
        },
      }
    );
  }
}

export function createReadStreamSafe(path: string): NodeJS.ReadableStream {
  return createReadStream(path);
}

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogg: "audio/ogg",
};

export function guessMimeType(pathOrName: string): string | undefined {
  const ext = pathOrName.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return MIME_TYPES[ext];
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
