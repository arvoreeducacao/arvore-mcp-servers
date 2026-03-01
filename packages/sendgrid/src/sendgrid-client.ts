import { SendGridMCPError } from "./types.js";

export class SendGridClient {
  private readonly baseUrl = "https://api.sendgrid.com/v3";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams(query);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return {} as T;
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new SendGridMCPError(
        `SendGrid API error (${res.status}): ${errorBody}`,
        "SENDGRID_API_ERROR",
        res.status
      );
    }

    return res.json() as Promise<T>;
  }
}
