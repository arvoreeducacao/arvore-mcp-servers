import { GupyMCPError } from "./types.js";

export class GupyClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(apiToken: string, baseUrl = "https://api.gupy.io") {
    this.apiToken = apiToken;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean>
  ): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    let url = `${this.baseUrl}${normalizedPath}`;

    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return {} as T;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const parsed: unknown = contentType.includes("application/json") && text
      ? JSON.parse(text)
      : text;

    if (!res.ok) {
      const message =
        typeof parsed === "string"
          ? parsed
          : JSON.stringify(parsed);
      throw new GupyMCPError(
        `Gupy API error (${res.status} ${res.statusText}): ${message}`,
        "GUPY_API_ERROR",
        res.status
      );
    }

    return parsed as T;
  }
}
