import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetabaseMCPTools } from "./tools.js";
import { MetabaseClient } from "./metabase-client.js";

vi.mock("./metabase-client.js", () => ({
  MetabaseClient: vi.fn(),
}));

describe("MetabaseMCPTools", () => {
  let tools: MetabaseMCPTools;
  let mockClient: {
    listCards: ReturnType<typeof vi.fn>;
    getCard: ReturnType<typeof vi.fn>;
    createCard: ReturnType<typeof vi.fn>;
    updateCard: ReturnType<typeof vi.fn>;
    deleteCard: ReturnType<typeof vi.fn>;
    runCardQuery: ReturnType<typeof vi.fn>;
    listDashboards: ReturnType<typeof vi.fn>;
    getDashboard: ReturnType<typeof vi.fn>;
    createDashboard: ReturnType<typeof vi.fn>;
    addCardToDashboard: ReturnType<typeof vi.fn>;
    deleteDashboard: ReturnType<typeof vi.fn>;
    listCollections: ReturnType<typeof vi.fn>;
    getCollectionItems: ReturnType<typeof vi.fn>;
    createCollection: ReturnType<typeof vi.fn>;
    listDatabases: ReturnType<typeof vi.fn>;
    runQuery: ReturnType<typeof vi.fn>;
    listTables: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      listCards: vi.fn(),
      getCard: vi.fn(),
      createCard: vi.fn(),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      runCardQuery: vi.fn(),
      listDashboards: vi.fn(),
      getDashboard: vi.fn(),
      createDashboard: vi.fn(),
      addCardToDashboard: vi.fn(),
      deleteDashboard: vi.fn(),
      listCollections: vi.fn(),
      getCollectionItems: vi.fn(),
      createCollection: vi.fn(),
      listDatabases: vi.fn(),
      runQuery: vi.fn(),
      listTables: vi.fn(),
    };
    tools = new MetabaseMCPTools(mockClient as unknown as MetabaseClient);
  });

  describe("listCards", () => {
    it("should return summarized card list", async () => {
      mockClient.listCards.mockResolvedValue([
        { id: 1, name: "Card 1", display: "table", collection_id: 5, archived: false, extra: "ignored" },
        { id: 2, name: "Card 2", display: "bar", collection_id: null, archived: true, extra: "ignored" },
      ]);

      const result = await tools.listCards({ filter: "all" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ id: 1, name: "Card 1", display: "table", collection_id: 5, archived: false });
      expect(parsed[1].extra).toBeUndefined();
    });
  });

  describe("getCard", () => {
    it("should return card details", async () => {
      const card = { id: 42, name: "Test Card", display: "line" };
      mockClient.getCard.mockResolvedValue(card);

      const result = await tools.getCard({ id: 42 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual(card);
      expect(mockClient.getCard).toHaveBeenCalledWith(42);
    });
  });

  describe("createCard", () => {
    it("should create a card and return result", async () => {
      const created = { id: 10, name: "New Card" };
      mockClient.createCard.mockResolvedValue(created);

      const result = await tools.createCard({
        name: "New Card",
        dataset_query: { type: "native", database: 1, native: { query: "SELECT 1" } },
        display: "table",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual(created);
      expect(mockClient.createCard).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Card", display: "table" })
      );
    });
  });

  describe("updateCard", () => {
    it("should filter undefined values and update", async () => {
      mockClient.updateCard.mockResolvedValue({ id: 5, name: "Updated" });

      const result = await tools.updateCard({ id: 5, name: "Updated", description: undefined });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.name).toBe("Updated");
      expect(mockClient.updateCard).toHaveBeenCalledWith(5, { name: "Updated" });
    });
  });

  describe("deleteCard", () => {
    it("should delete and return success message", async () => {
      mockClient.deleteCard.mockResolvedValue(undefined);

      const result = await tools.deleteCard({ id: 7 });

      expect(result.content[0].text).toBe("Card 7 deleted successfully");
    });
  });

  describe("runCardQuery", () => {
    it("should return formatted query results with truncation info", async () => {
      const rows = Array.from({ length: 150 }, (_, i) => [i]);
      mockClient.runCardQuery.mockResolvedValue({
        row_count: 150,
        status: "completed",
        data: {
          rows,
          cols: [{ display_name: "ID", name: "id" }],
        },
      });

      const result = await tools.runCardQuery({ id: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.row_count).toBe(150);
      expect(parsed.status).toBe("completed");
      expect(parsed.columns).toEqual(["ID"]);
      expect(parsed.rows).toHaveLength(100);
      expect(parsed.truncated).toBe(true);
    });

    it("should not truncate when rows <= 100", async () => {
      mockClient.runCardQuery.mockResolvedValue({
        row_count: 2,
        status: "completed",
        data: {
          rows: [[1], [2]],
          cols: [{ name: "id" }],
        },
      });

      const result = await tools.runCardQuery({ id: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.rows).toHaveLength(2);
      expect(parsed.truncated).toBe(false);
    });
  });

  describe("listDashboards", () => {
    it("should return summarized dashboard list", async () => {
      mockClient.listDashboards.mockResolvedValue([
        { id: 1, name: "Dashboard 1", description: "Desc", collection_id: 3, extra: "ignored" },
      ]);

      const result = await tools.listDashboards();
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ id: 1, name: "Dashboard 1", description: "Desc", collection_id: 3 });
    });
  });

  describe("getDashboard", () => {
    it("should return dashboard details", async () => {
      const dashboard = { id: 1, name: "Dashboard", dashcards: [] };
      mockClient.getDashboard.mockResolvedValue(dashboard);

      const result = await tools.getDashboard({ id: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual(dashboard);
    });
  });

  describe("createDashboard", () => {
    it("should create a dashboard", async () => {
      mockClient.createDashboard.mockResolvedValue({ id: 5, name: "New" });

      const result = await tools.createDashboard({ name: "New" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual({ id: 5, name: "New" });
    });
  });

  describe("addCardToDashboard", () => {
    it("should add card to dashboard", async () => {
      mockClient.addCardToDashboard.mockResolvedValue({ id: 1, dashcards: [{ card_id: 10 }] });

      const result = await tools.addCardToDashboard({
        dashboard_id: 1,
        card_id: 10,
        row: 0,
        col: 0,
        size_x: 6,
        size_y: 4,
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.dashcards).toHaveLength(1);
      expect(mockClient.addCardToDashboard).toHaveBeenCalledWith(1, {
        cardId: 10,
        row: 0,
        col: 0,
        size_x: 6,
        size_y: 4,
      });
    });
  });

  describe("deleteDashboard", () => {
    it("should delete and return success message", async () => {
      mockClient.deleteDashboard.mockResolvedValue(undefined);

      const result = await tools.deleteDashboard({ id: 3 });

      expect(result.content[0].text).toBe("Dashboard 3 deleted successfully");
    });
  });

  describe("listCollections", () => {
    it("should return summarized collection list", async () => {
      mockClient.listCollections.mockResolvedValue([
        { id: 1, name: "Root", description: null, effective_location: "/", extra: "ignored" },
      ]);

      const result = await tools.listCollections({});
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ id: 1, name: "Root", description: null, parent_id: "/" });
    });
  });

  describe("getCollectionItems", () => {
    it("should handle items as array", async () => {
      mockClient.getCollectionItems.mockResolvedValue([
        { id: 1, name: "Card 1", model: "card", description: "A card", collection_id: 5 },
      ]);

      const result = await tools.getCollectionItems({ id: 5 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].model).toBe("card");
    });

    it("should handle items with data wrapper", async () => {
      mockClient.getCollectionItems.mockResolvedValue({
        data: [{ id: 2, name: "Dashboard 1", model: "dashboard", description: null, collection_id: 5 }],
      });

      const result = await tools.getCollectionItems({ id: 5 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].model).toBe("dashboard");
    });
  });

  describe("createCollection", () => {
    it("should create a collection", async () => {
      mockClient.createCollection.mockResolvedValue({ id: 10, name: "New" });

      const result = await tools.createCollection({ name: "New" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual({ id: 10, name: "New" });
    });
  });

  describe("listDatabases", () => {
    it("should return formatted database list", async () => {
      mockClient.listDatabases.mockResolvedValue({
        data: [
          { id: 1, name: "H2", engine: "h2", extra: "ignored" },
          { id: 2, name: "Postgres", engine: "postgres", extra: "ignored" },
        ],
      });

      const result = await tools.listDatabases();
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ id: 1, name: "H2", engine: "h2" });
    });

    it("should return raw result when data is not an array", async () => {
      const raw = { message: "unexpected format" };
      mockClient.listDatabases.mockResolvedValue(raw);

      const result = await tools.listDatabases();
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual(raw);
    });
  });

  describe("runQuery", () => {
    it("should return formatted query results with truncation", async () => {
      const rows = Array.from({ length: 250 }, (_, i) => [i]);
      mockClient.runQuery.mockResolvedValue({
        row_count: 250,
        status: "completed",
        data: {
          rows,
          cols: [{ display_name: "Count", name: "count" }],
        },
      });

      const result = await tools.runQuery({ database: 1, query: "SELECT count(*) FROM users" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.row_count).toBe(250);
      expect(parsed.columns).toEqual(["Count"]);
      expect(parsed.rows).toHaveLength(200);
      expect(parsed.truncated).toBe(true);
    });
  });

  describe("listTables", () => {
    it("should return formatted table list", async () => {
      mockClient.listTables.mockResolvedValue({
        tables: [
          { id: 1, name: "users", schema: "public", display_name: "Users", extra: "ignored" },
        ],
      });

      const result = await tools.listTables({ database_id: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ id: 1, name: "users", schema: "public", display_name: "Users" });
    });

    it("should return raw metadata when tables is not present", async () => {
      const raw = [{ id: 1, name: "raw" }];
      mockClient.listTables.mockResolvedValue(raw);

      const result = await tools.listTables({ database_id: 1 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toEqual(raw);
    });
  });
});
