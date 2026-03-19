import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetabaseClient } from "./metabase-client.js";
import { MetabaseMCPError } from "./types.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MetabaseClient", () => {
  let client: MetabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MetabaseClient({
      url: "https://metabase.example.com",
      apiKey: "test-api-key",
    });
  });

  const mockResponse = (data: unknown, status = 200) => {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  };

  const mockErrorResponse = (status: number, body: string) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    });
  };

  describe("constructor", () => {
    it("should strip trailing slash from URL", () => {
      const c = new MetabaseClient({ url: "https://metabase.example.com/", apiKey: "key" });
      mockResponse({ id: 1 });
      c.testConnection();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/user/current",
        expect.any(Object)
      );
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection", async () => {
      mockResponse({ id: 1, email: "admin@test.com" });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/user/current",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "x-api-key": "test-api-key",
          }),
        })
      );
    });

    it("should return false on connection failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe("listCards", () => {
    it("should list cards with default filter", async () => {
      const cards = [{ id: 1, name: "Card 1" }, { id: 2, name: "Card 2" }];
      mockResponse(cards);

      const result = await client.listCards();

      expect(result).toEqual(cards);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card?f=all",
        expect.any(Object)
      );
    });

    it("should list cards with custom filter", async () => {
      mockResponse([]);

      await client.listCards("mine");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card?f=mine",
        expect.any(Object)
      );
    });
  });

  describe("getCard", () => {
    it("should get a card by ID", async () => {
      const card = { id: 42, name: "Test Card" };
      mockResponse(card);

      const result = await client.getCard(42);

      expect(result).toEqual(card);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card/42",
        expect.any(Object)
      );
    });
  });

  describe("createCard", () => {
    it("should create a card with correct payload", async () => {
      const newCard = { id: 10, name: "New Card" };
      mockResponse(newCard);

      const params = {
        name: "New Card",
        dataset_query: { type: "native", database: 1, native: { query: "SELECT 1" } },
        display: "table",
      };
      const result = await client.createCard(params);

      expect(result).toEqual(newCard);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(params),
        })
      );
    });
  });

  describe("updateCard", () => {
    it("should update a card", async () => {
      const updated = { id: 5, name: "Updated" };
      mockResponse(updated);

      const result = await client.updateCard(5, { name: "Updated" });

      expect(result).toEqual(updated);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card/5",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  describe("deleteCard", () => {
    it("should delete a card", async () => {
      mockResponse({}, 204);

      await client.deleteCard(5);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card/5",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("runCardQuery", () => {
    it("should run card query without parameters", async () => {
      const queryResult = { data: { rows: [[1]], cols: [{ name: "id" }] } };
      mockResponse(queryResult);

      const result = await client.runCardQuery(10);

      expect(result).toEqual(queryResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card/10/query",
        expect.objectContaining({ method: "POST", body: undefined })
      );
    });

    it("should run card query with parameters", async () => {
      mockResponse({ data: { rows: [] } });

      await client.runCardQuery(10, [{ type: "category", value: "test" }]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/card/10/query",
        expect.objectContaining({
          body: JSON.stringify({ parameters: [{ type: "category", value: "test" }] }),
        })
      );
    });
  });

  describe("listDashboards", () => {
    it("should list dashboards", async () => {
      const dashboards = [{ id: 1, name: "Dashboard 1" }];
      mockResponse(dashboards);

      const result = await client.listDashboards();

      expect(result).toEqual(dashboards);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/dashboard",
        expect.any(Object)
      );
    });
  });

  describe("getDashboard", () => {
    it("should get a dashboard by ID", async () => {
      const dashboard = { id: 1, name: "Dashboard 1", dashcards: [] };
      mockResponse(dashboard);

      const result = await client.getDashboard(1);

      expect(result).toEqual(dashboard);
    });
  });

  describe("createDashboard", () => {
    it("should create a dashboard", async () => {
      const created = { id: 5, name: "New Dashboard" };
      mockResponse(created);

      const result = await client.createDashboard({ name: "New Dashboard" });

      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/dashboard",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("addCardToDashboard", () => {
    it("should add a card to a dashboard", async () => {
      mockResponse({ id: 1, dashcards: [{ id: 100, card: { id: 5 }, row: 0, col: 0, size_x: 6, size_y: 4 }] });
      mockResponse({ id: 1, dashcards: [] });

      await client.addCardToDashboard(1, {
        cardId: 10,
        row: 0,
        col: 6,
        size_x: 6,
        size_y: 4,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[0]).toBe("https://metabase.example.com/api/dashboard/1");
      expect(secondCall[1].method).toBe("PUT");
      const body = JSON.parse(secondCall[1].body);
      expect(body.dashcards).toHaveLength(2);
    });
  });

  describe("deleteDashboard", () => {
    it("should delete a dashboard", async () => {
      mockResponse({}, 204);

      await client.deleteDashboard(3);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/dashboard/3",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("listCollections", () => {
    it("should list collections without namespace", async () => {
      mockResponse([{ id: 1, name: "Root" }]);

      const result = await client.listCollections();

      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/collection",
        expect.any(Object)
      );
    });

    it("should list collections with namespace", async () => {
      mockResponse([]);

      await client.listCollections("snippets");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/collection?namespace=snippets",
        expect.any(Object)
      );
    });
  });

  describe("getCollectionItems", () => {
    it("should get collection items", async () => {
      const items = [{ id: 1, name: "Item 1", model: "card" }];
      mockResponse(items);

      const result = await client.getCollectionItems(5);

      expect(result).toEqual(items);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/collection/5/items",
        expect.any(Object)
      );
    });
  });

  describe("createCollection", () => {
    it("should create a collection", async () => {
      mockResponse({ id: 10, name: "New Collection" });

      const result = await client.createCollection({ name: "New Collection" });

      expect(result).toEqual({ id: 10, name: "New Collection" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/collection",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("listDatabases", () => {
    it("should list databases", async () => {
      const dbs = { data: [{ id: 1, name: "H2", engine: "h2" }] };
      mockResponse(dbs);

      const result = await client.listDatabases();

      expect(result).toEqual(dbs);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/database",
        expect.any(Object)
      );
    });
  });

  describe("runQuery", () => {
    it("should run a native SQL query", async () => {
      const queryResult = { data: { rows: [[1, "test"]], cols: [{ name: "id" }, { name: "name" }] } };
      mockResponse(queryResult);

      const result = await client.runQuery(1, "SELECT * FROM users");

      expect(result).toEqual(queryResult);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/dataset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            database: 1,
            type: "native",
            native: { query: "SELECT * FROM users" },
          }),
        })
      );
    });
  });

  describe("listTables", () => {
    it("should list tables for a database", async () => {
      const metadata = { tables: [{ id: 1, name: "users", schema: "public" }] };
      mockResponse(metadata);

      const result = await client.listTables(1);

      expect(result).toEqual(metadata);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://metabase.example.com/api/database/1/metadata",
        expect.any(Object)
      );
    });
  });

  describe("error handling", () => {
    it("should throw MetabaseMCPError on HTTP error", async () => {
      mockErrorResponse(401, "Unauthorized");

      await expect(client.listCards()).rejects.toThrow(MetabaseMCPError);
      await expect(client.listCards()).rejects.toThrow(); 
    });

    it("should throw MetabaseMCPError with correct code on HTTP error", async () => {
      mockErrorResponse(404, "Not found");

      try {
        await client.getCard(999);
      } catch (error) {
        expect(error).toBeInstanceOf(MetabaseMCPError);
        expect((error as MetabaseMCPError).code).toBe("HTTP_404");
      }
    });

    it("should throw MetabaseMCPError on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      try {
        await client.listCards();
      } catch (error) {
        expect(error).toBeInstanceOf(MetabaseMCPError);
        expect((error as MetabaseMCPError).code).toBe("REQUEST_FAILED");
      }
    });

    it("should handle 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });

      const result = await client.deleteCard(1);

      expect(result).toBeUndefined();
    });
  });
});
