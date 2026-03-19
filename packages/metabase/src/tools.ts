import { MetabaseClient } from "./metabase-client.js";
import {
    ListCardsParams,
    GetCardParams,
    CreateCardParams,
    UpdateCardParams,
    DeleteCardParams,
    RunCardQueryParams,
    GetDashboardParams,
    CreateDashboardParams,
    AddCardToDashboardParams,
    DeleteDashboardParams,
    GetCollectionItemsParams,
    CreateCollectionParams,
    ListCollectionsParams,
    RunQueryParams,
    ListTablesParams,
    McpToolResult,
} from "./types.js";

export class MetabaseMCPTools {
  constructor(private client: MetabaseClient) {}

  async listCards(params: ListCardsParams): Promise<McpToolResult> {
    const cards = await this.client.listCards(params.filter);
    const summary = (cards as Array<Record<string, unknown>>).map((c) => ({
      id: c.id,
      name: c.name,
      display: c.display,
      collection_id: c.collection_id,
      archived: c.archived,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }

  async getCard(params: GetCardParams): Promise<McpToolResult> {
    const card = await this.client.getCard(params.id);
    return {
      content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
    };
  }

  async createCard(params: CreateCardParams): Promise<McpToolResult> {
    const card = await this.client.createCard({
      name: params.name,
      dataset_query: params.dataset_query,
      display: params.display,
      description: params.description,
      collection_id: params.collection_id,
      visualization_settings: params.visualization_settings || {},
    });
    return {
      content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
    };
  }

  async updateCard(params: UpdateCardParams): Promise<McpToolResult> {
    const { id, ...updates } = params;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    const card = await this.client.updateCard(id, filtered);
    return {
      content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
    };
  }

  async deleteCard(params: DeleteCardParams): Promise<McpToolResult> {
    await this.client.deleteCard(params.id);
    return {
      content: [{ type: "text", text: `Card ${params.id} deleted successfully` }],
    };
  }

  async runCardQuery(params: RunCardQueryParams): Promise<McpToolResult> {
    const result = await this.client.runCardQuery(params.id, params.parameters);
    const data = result as Record<string, unknown>;
    const rows = (data.data as Record<string, unknown>)?.rows;
    const cols = (data.data as Record<string, unknown>)?.cols;

    const formatted = {
      row_count: data.row_count,
      status: data.status,
      columns: (cols as Array<Record<string, unknown>>)?.map((c) => c.display_name || c.name),
      rows: (rows as unknown[][])?.slice(0, 100),
      truncated: (rows as unknown[][])?.length > 100,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
    };
  }

  async listDashboards(): Promise<McpToolResult> {
    const dashboards = await this.client.listDashboards();
    const summary = (dashboards as Array<Record<string, unknown>>).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      collection_id: d.collection_id,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }

  async getDashboard(params: GetDashboardParams): Promise<McpToolResult> {
    const dashboard = await this.client.getDashboard(params.id);
    return {
      content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }],
    };
  }

  async createDashboard(params: CreateDashboardParams): Promise<McpToolResult> {
    const dashboard = await this.client.createDashboard(params);
    return {
      content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }],
    };
  }

  async addCardToDashboard(params: AddCardToDashboardParams): Promise<McpToolResult> {
    const result = await this.client.addCardToDashboard(params.dashboard_id, {
      cardId: params.card_id,
      row: params.row,
      col: params.col,
      size_x: params.size_x,
      size_y: params.size_y,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  async deleteDashboard(params: DeleteDashboardParams): Promise<McpToolResult> {
    await this.client.deleteDashboard(params.id);
    return {
      content: [{ type: "text", text: `Dashboard ${params.id} deleted successfully` }],
    };
  }

  async listCollections(params: ListCollectionsParams): Promise<McpToolResult> {
    const collections = await this.client.listCollections(params.namespace);
    const summary = (collections as Array<Record<string, unknown>>).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      parent_id: c.effective_location,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
  async getCollectionItems(params: GetCollectionItemsParams): Promise<McpToolResult> {
    const items = await this.client.getCollectionItems(params.id);
    const rawItems = (items as unknown as { data?: Array<Record<string, unknown>> });
    const list = rawItems.data ?? (items as Array<Record<string, unknown>>);
    const summary = list.map((item) => ({
      id: item.id,
      name: item.name,
      model: item.model,
      description: item.description,
      collection_id: item.collection_id,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }

  async createCollection(params: CreateCollectionParams): Promise<McpToolResult> {
    const collection = await this.client.createCollection(params);
    return {
      content: [{ type: "text", text: JSON.stringify(collection, null, 2) }],
    };
  }

  async listDatabases(): Promise<McpToolResult> {
    const result = await this.client.listDatabases();
    const data = result as Record<string, unknown>;
    const databases = (data.data as Array<Record<string, unknown>>)?.map((db) => ({
      id: db.id,
      name: db.name,
      engine: db.engine,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(databases || result, null, 2) }],
    };
  }

  async runQuery(params: RunQueryParams): Promise<McpToolResult> {
    const result = await this.client.runQuery(params.database, params.query);
    const data = result as Record<string, unknown>;
    const rows = (data.data as Record<string, unknown>)?.rows;
    const cols = (data.data as Record<string, unknown>)?.cols;

    const formatted = {
      row_count: data.row_count,
      status: data.status,
      columns: (cols as Array<Record<string, unknown>>)?.map((c) => c.display_name || c.name),
      rows: (rows as unknown[][])?.slice(0, 200),
      truncated: (rows as unknown[][])?.length > 200,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
    };
  }

  async listTables(params: ListTablesParams): Promise<McpToolResult> {
    const metadata = await this.client.listTables(params.database_id);
    const data = metadata as unknown as Record<string, unknown>;
    const tables = (data.tables as Array<Record<string, unknown>>)?.map((t) => ({
      id: t.id,
      name: t.name,
      schema: t.schema,
      display_name: t.display_name,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(tables || metadata, null, 2) }],
    };
  }
}
