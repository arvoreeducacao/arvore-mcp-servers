import { HubSpotMCPError } from "./types.js";

export class HubSpotClient {
  private readonly baseUrl = "https://api.hubapi.com";
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | string[]>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            params.append(key, item);
          }
        } else {
          params.append(key, value);
        }
      }
      const qs = params.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return {} as T;
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new HubSpotMCPError(
        `HubSpot API error (${res.status}): ${errorBody}`,
        "HUBSPOT_API_ERROR",
        res.status
      );
    }

    const text = await res.text();
    if (!text) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }
}
