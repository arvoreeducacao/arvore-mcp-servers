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
    update: ReturnType<typeof vi.fn>;
    findSimilar: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
  };

  const parse = (result: { content: Array<{ text: string }> }) =>
    JSON.parse(result.content[0].text);

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      search: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      add: vi.fn(),
      update: vi.fn(),
      findSimilar: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      remove: vi.fn(),
      archive: vi.fn(),
    };
    tools = new MemoryMCPTools(mockStore as unknown as MemoryStore, {
      author: "joao.barros@arvore.com.br",
    });
  });

  describe("read_memories — index", () => {
    it("groups the catalog by category and reports the total", async () => {
      mockStore.list.mockResolvedValue([
        { id: "m1", title: "Memory 1", category: "decisions", date: "2026-01-01", tags: [], status: "active", snippet: "..." },
        { id: "m2", title: "Memory 2", category: "decisions", date: "2026-02-01", tags: ["db"], status: "active", snippet: "..." },
        { id: "m3", title: "Memory 3", category: "gotchas", date: "2026-03-01", tags: [], status: "active", snippet: "..." },
      ]);
      mockStore.count.mockResolvedValue(10);

      const result = await tools.readMemories({ limit: 30 });
      const parsed = parse(result);

      expect(parsed.mode).toBe("index");
      expect(parsed.showing).toBe(3);
      expect(parsed.total).toBe(10);
      expect(parsed.truncated).toBe(true);
      expect(parsed.categories).toHaveLength(2);
      expect(parsed.categories[0]).toMatchObject({ category: "decisions", count: 2 });
      expect(parsed.categories[1]).toMatchObject({ category: "gotchas", count: 1 });
    });

    it("forwards filters to the store and defaults to active", async () => {
      await tools.readMemories({ category: "gotchas", tags: ["crm"], limit: 30 });

      expect(mockStore.list).toHaveBeenCalledWith({
        category: "gotchas",
        status: "active",
        tags: ["crm"],
        author: undefined,
        limit: 30,
      });
    });
  });

  describe("read_memories — search", () => {
    it("returns scored results for a query", async () => {
      mockStore.search.mockResolvedValue([
        {
          id: "use-postgres",
          title: "Use PostgreSQL",
          category: "decisions",
          date: "2026-06-01",
          tags: ["database"],
          status: "active",
          snippet: "We chose PostgreSQL...",
          score: 0.85,
        },
      ]);

      const result = await tools.readMemories({ query: "database choice", limit: 30 });
      const parsed = parse(result);

      expect(parsed.mode).toBe("search");
      expect(parsed.count).toBe(1);
      expect(parsed.results[0].title).toBe("Use PostgreSQL");
      expect(mockStore.search).toHaveBeenCalledWith("database choice", {
        category: undefined,
        status: "active",
        tags: undefined,
        author: undefined,
        limit: 30,
      });
    });

    it("comes back empty without breaking", async () => {
      const parsed = parse(await tools.readMemories({ query: "nonexistent", limit: 30 }));

      expect(parsed.count).toBe(0);
      expect(parsed.results).toEqual([]);
      expect(parsed.next).toBeUndefined();
    });
  });

  describe("read_memories — one memory", () => {
    it("returns the full content when the id exists", async () => {
      mockStore.get.mockResolvedValue({
        id: "use-postgres",
        title: "Use PostgreSQL",
        category: "decisions",
        date: "2026-06-01",
        tags: ["database"],
        status: "active",
        content: "Full content about the PostgreSQL decision.",
      });

      const parsed = parse(await tools.readMemories({ id: "use-postgres", limit: 30 }));

      expect(parsed.found).toBe(true);
      expect(parsed.content).toBe("Full content about the PostgreSQL decision.");
      expect(mockStore.search).not.toHaveBeenCalled();
    });

    it("suggests neighbours when the id is unknown", async () => {
      mockStore.get.mockResolvedValue(null);
      mockStore.search.mockResolvedValue([{ id: "real-one", title: "Real One" }]);

      const parsed = parse(await tools.readMemories({ id: "wrong-id", limit: 30 }));

      expect(parsed.found).toBe(false);
      expect(parsed.didYouMean).toEqual([{ id: "real-one", title: "Real One" }]);
    });
  });

  describe("write_memory — create", () => {
    it("creates the memory attributing it to the authenticated author", async () => {
      mockStore.add.mockResolvedValue({
        id: "2026-06-01-jwt-auth",
        title: "JWT Auth Strategy",
        category: "decisions",
        date: "2026-06-01",
        author: "joao.barros@arvore.com.br",
        tags: ["auth"],
      });

      const parsed = parse(
        await tools.writeMemory({
          action: "save",
          title: "JWT Auth Strategy",
          category: "decisions",
          content: "We chose JWT with refresh tokens.",
          tags: ["auth"],
        })
      );

      expect(parsed.saved).toBe(true);
      expect(parsed.created).toBe(true);
      expect(mockStore.add).toHaveBeenCalledWith(
        expect.objectContaining({ author: "joao.barros@arvore.com.br" })
      );
    });

    it("asks for the missing fields instead of failing", async () => {
      const parsed = parse(await tools.writeMemory({ action: "save", title: "Only a title" }));

      expect(parsed.saved).toBe(false);
      expect(parsed.reason).toBe("missing_fields");
      expect(parsed.missing).toEqual(["category", "content"]);
      expect(mockStore.add).not.toHaveBeenCalled();
    });

    it("refuses to duplicate a near-identical memory", async () => {
      mockStore.findSimilar.mockResolvedValue({
        id: "2026-06-01-jwt-auth",
        title: "JWT Auth Strategy",
        category: "decisions",
        score: 0.92,
      });

      const parsed = parse(
        await tools.writeMemory({
          action: "save",
          title: "JWT authentication approach",
          category: "decisions",
          content: "We use JWT with refresh tokens.",
        })
      );

      expect(parsed.saved).toBe(false);
      expect(parsed.reason).toBe("similar_memory_exists");
      expect(parsed.similar.id).toBe("2026-06-01-jwt-auth");
      expect(mockStore.add).not.toHaveBeenCalled();
    });

    it("creates anyway under force", async () => {
      mockStore.findSimilar.mockResolvedValue({ id: "existing", title: "Existing", score: 0.95 });
      mockStore.add.mockResolvedValue({ id: "new-one", title: "New One", category: "decisions", tags: [] });

      const parsed = parse(
        await tools.writeMemory({
          action: "save",
          title: "New One",
          category: "decisions",
          content: "content",
          force: true,
        })
      );

      expect(parsed.created).toBe(true);
      expect(mockStore.findSimilar).not.toHaveBeenCalled();
      expect(mockStore.add).toHaveBeenCalled();
    });
  });

  describe("write_memory — update", () => {
    it("patches an existing memory when an id is given", async () => {
      mockStore.update.mockResolvedValue({
        id: "2026-06-01-jwt-auth",
        title: "JWT Auth Strategy",
        category: "decisions",
        status: "active",
        updated: "2026-08-13",
        tags: ["auth"],
      });

      const parsed = parse(
        await tools.writeMemory({
          action: "save",
          id: "2026-06-01-jwt-auth",
          content: "Rotation moved to 15 minutes.",
        })
      );

      expect(parsed.saved).toBe(true);
      expect(parsed.created).toBe(false);
      expect(parsed.updated).toBe("2026-08-13");
      expect(mockStore.update).toHaveBeenCalledWith("2026-06-01-jwt-auth", {
        title: undefined,
        content: "Rotation moved to 15 minutes.",
        tags: undefined,
        category: undefined,
        status: undefined,
        author: "joao.barros@arvore.com.br",
      });
      expect(mockStore.add).not.toHaveBeenCalled();
    });

    it("surfaces a store failure as a tool error", async () => {
      mockStore.update.mockRejectedValue(new MemoryMCPError('Memory "nope" not found', "NOT_FOUND"));

      const result = await tools.writeMemory({ action: "save", id: "nope", content: "x" });
      const parsed = parse(result);

      expect(result.isError).toBe(true);
      expect(parsed.code).toBe("NOT_FOUND");
    });
  });

  describe("write_memory — archive and delete", () => {
    it("archives by id", async () => {
      mockStore.archive.mockResolvedValue({
        id: "old-decision",
        title: "Old Decision",
        status: "archived",
      });

      const parsed = parse(await tools.writeMemory({ action: "archive", id: "old-decision" }));

      expect(parsed.saved).toBe(true);
      expect(parsed.status).toBe("archived");
    });

    it("deletes by id", async () => {
      mockStore.remove.mockResolvedValue(undefined);

      const parsed = parse(await tools.writeMemory({ action: "delete", id: "old-memory" }));

      expect(parsed.saved).toBe(true);
      expect(parsed.action).toBe("delete");
      expect(mockStore.remove).toHaveBeenCalledWith("old-memory");
    });

    it("requires an id to archive", async () => {
      const parsed = parse(await tools.writeMemory({ action: "archive" }));

      expect(parsed.saved).toBe(false);
      expect(parsed.missing).toEqual(["id"]);
      expect(mockStore.archive).not.toHaveBeenCalled();
    });
  });
});
