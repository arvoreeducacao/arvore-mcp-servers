import {
    MetabaseConfig,
    MetabaseMCPError,
} from "./types.js";

export class MetabaseClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: MetabaseConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new MetabaseMCPError(
          `Metabase API error (${response.status}): ${errorText}`,
          `HTTP_${response.status}`
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof MetabaseMCPError) throw error;
      throw new MetabaseMCPError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        "REQUEST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "/user/current");
      return true;
    } catch {
      return false;
    }
  }

  async listCards(filter: string = "all"): Promise<unknown[]> {
    return this.request<unknown[]>("GET", `/card?f=${filter}`);
  }

  async getCard(id: number): Promise<unknown> {
    return this.request<unknown>("GET", `/card/${id}`);
  }

  async createCard(params: {
    name: string;
    dataset_query: unknown;
    display: string;
    description?: string;
    collection_id?: number;
    visualization_settings?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request<unknown>("POST", "/card", params);
  }

  async updateCard(
    id: number,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.request<unknown>("PUT", `/card/${id}`, params);
  }

  async deleteCard(id: number): Promise<void> {
    await this.request<unknown>("DELETE", `/card/${id}`);
  }

  async runCardQuery(
    id: number,
    parameters?: Array<Record<string, unknown>>
  ): Promise<unknown> {
    const body = parameters ? { parameters } : undefined;
    return this.request<unknown>("POST", `/card/${id}/query`, body);
  }

  async listDashboards(): Promise<unknown[]> {
    return this.request<unknown[]>("GET", "/dashboard");
  }

  async getDashboard(id: number): Promise<unknown> {
    return this.request<unknown>("GET", `/dashboard/${id}`);
  }

  async createDashboard(params: {
    name: string;
    description?: string;
    collection_id?: number;
    parameters?: Array<Record<string, unknown>>;
  }): Promise<unknown> {
    return this.request<unknown>("POST", "/dashboard", params);
  }

  async addCardToDashboard(
    dashboardId: number,
    params: {
      cardId: number;
      row: number;
      col: number;
      size_x: number;
      size_y: number;
    }
  ): Promise<unknown> {
    const dashboard = await this.getDashboard(dashboardId) as Record<string, unknown>;
    const existingCards = (dashboard.dashcards as Array<Record<string, unknown>>) || [];

    const newDashcard = {
      id: -Math.floor(Math.random() * 1000000),
      card_id: params.cardId,
      row: params.row,
      col: params.col,
      size_x: params.size_x,
      size_y: params.size_y,
    };

    const dashcards = [
      ...existingCards.map((dc) => ({
        id: dc.id,
        card_id: (dc.card as Record<string, unknown>)?.id ?? dc.card_id,
        row: dc.row,
        col: dc.col,
        size_x: dc.size_x,
        size_y: dc.size_y,
      })),
      newDashcard,
    ];

    return this.request<unknown>("PUT", `/dashboard/${dashboardId}`, { dashcards });
  }

  async deleteDashboard(id: number): Promise<void> {
    await this.request<unknown>("DELETE", `/dashboard/${id}`);
  }

  async listCollections(namespace?: string): Promise<unknown[]> {
    const query = namespace ? `?namespace=${namespace}` : "";
    return this.request<unknown[]>("GET", `/collection${query}`);
  }
  async getCollectionItems(collectionId: number): Promise<unknown[]> {
    return this.request<unknown[]>("GET", `/collection/${collectionId}/items`);
  }

  async createCollection(params: {
    name: string;
    description?: string;
    parent_id?: number;
    color?: string;
  }): Promise<unknown> {
    return this.request<unknown>("POST", "/collection", params);
  }

  async listDatabases(): Promise<unknown> {
    return this.request<unknown>("GET", "/database");
  }

  async runQuery(database: number, query: string): Promise<unknown> {
    return this.request<unknown>("POST", "/dataset", {
      database,
      type: "native",
      native: { query },
    });
  }

  async listTables(databaseId: number): Promise<unknown[]> {
    return this.request<unknown[]>("GET", `/database/${databaseId}/metadata`);
  }
}
