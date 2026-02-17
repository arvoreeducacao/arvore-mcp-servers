import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryMCPTools } from "./tools.js";
import { MemoryStore } from "./store.js";
import { MemoryMCPError } from "./types.js";

vi.mock("./store.js", () => ({
  MemoryStore: vi.fn(),
}));

describe("MemoryMCPTools", () => {
  let tools: MemoryMCPTools;
  let mockStore: {
    search: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      search: vi.fn(),
      get: vi.fn(),
      add: vi.fn(),
      list: vi.fn(),
      remove: vi.fn(),
      archive: vi.fn(),
    };
    tools = new MemoryMCPTools(mockStore as unknown as MemoryStore);
  });

  describe("searchMemories", () => {
    it("should return search results with count", async () => {
      mockStore.search.mockResolvedValue([
        {
          id: "use-postgres",
          title: "Use PostgreSQL",
          category: "decisions",
          date: "2024-06-01",
          tags: ["database"],
          status: "active",
          snippet: "We chose PostgreSQL...",
          score: 0.85,
        },
      ]);

      const result = await tools.searchMemories({
        query: "database choice",
        status: "active",
        limit: 10,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.query).toBe("database choice");
      expect(parsed.count).toBe(1);
      expect(parsed.results[0].title).toBe("Use PostgreSQL");
    });

    it("should return empty results for no matches", async () => {
      mockStore.search.mockResolvedValue([]);

      const result = await tools.searchMemories({
        query: "nonexistent topic",
        status: "active",
        limit: 10,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.results).toEqual([]);
    });

    it("should pass category filter to store", async () => {
      mockStore.search.mockResolvedValue([]);

      await tools.searchMemories({
        query: "test",
        category: "decisions",
        status: "active",
        limit: 10,
      });

      expect(mockStore.search).toHaveBeenCalledWith("test", {
        category: "decisions",
        status: "active",
        limit: 10,
      });
    });
  });

  describe("getMemory", () => {
    it("should return full memory content", async () => {
      mockStore.get.mockReturnValue({
        id: "use-postgres",
        title: "Use PostgreSQL",
        category: "decisions",
        date: "2024-06-01",
        tags: ["database"],
        status: "active",
        content: "Full content about PostgreSQL decision.",
      });

      const result = await tools.getMemory({ id: "use-postgres" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.title).toBe("Use PostgreSQL");
      expect(parsed.content).toBe("Full content about PostgreSQL decision.");
    });

    it("should return error for non-existent memory", async () => {
      mockStore.get.mockReturnValue(null);

      const result = await tools.getMemory({ id: "nope" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).toContain("not found");
    });
  });

  describe("addMemory", () => {
    it("should create a new memory and return result", async () => {
      mockStore.add.mockResolvedValue({
        id: "2024-06-01-jwt-auth",
        path: "/memories/decisions/2024-06-01-jwt-auth.md",
        title: "JWT Auth Strategy",
        category: "decisions",
      });

      const result = await tools.addMemory({
        title: "JWT Auth Strategy",
        category: "decisions",
        content: "We chose JWT with refresh tokens.",
        tags: ["auth"],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.created).toBe(true);
      expect(parsed.title).toBe("JWT Auth Strategy");
    });

    it("should return error on failure", async () => {
      mockStore.add.mockRejectedValue(
        new MemoryMCPError("Write failed", "WRITE_ERROR")
      );

      const result = await tools.addMemory({
        title: "Fail",
        category: "decisions",
        content: "content",
        tags: [],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Memory Error");
    });
  });

  describe("listMemories", () => {
    it("should return all memories with count", async () => {
      mockStore.list.mockReturnValue([
        { id: "m1", title: "Memory 1", category: "decisions", date: "2024-01-01", tags: [], status: "active", snippet: "..." },
        { id: "m2", title: "Memory 2", category: "conventions", date: "2024-02-01", tags: [], status: "active", snippet: "..." },
      ]);

      const result = await tools.listMemories({ limit: 50 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.count).toBe(2);
      expect(parsed.memories).toHaveLength(2);
    });
  });

  describe("removeMemory", () => {
    it("should confirm removal", async () => {
      mockStore.remove.mockResolvedValue(undefined);

      const result = await tools.removeMemory({ id: "old-memory" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.removed).toBe(true);
      expect(parsed.id).toBe("old-memory");
    });

    it("should return error for non-existent", async () => {
      mockStore.remove.mockRejectedValue(
        new MemoryMCPError("not found", "NOT_FOUND")
      );

      const result = await tools.removeMemory({ id: "nope" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.error).toContain("Memory Error");
    });
  });

  describe("archiveMemory", () => {
    it("should confirm archival", async () => {
      mockStore.archive.mockResolvedValue({
        id: "old-decision",
        title: "Old Decision",
      });

      const result = await tools.archiveMemory({ id: "old-decision" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.archived).toBe(true);
      expect(parsed.title).toBe("Old Decision");
    });
  });
});
