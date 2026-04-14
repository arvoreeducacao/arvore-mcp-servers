import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { MemoryStore } from "./store.js";

vi.mock("./embeddings.js", () => ({
  EmbeddingEngine: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    isReady: vi.fn().mockReturnValue(false),
    embed: vi.fn(),
    getModelName: vi.fn().mockReturnValue("test-model"),
  })),
}));

vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn(),
}));

const TEST_DIR = join(tmpdir(), `memory-mcp-test-${Date.now()}`);

function buildFrontmatter(data: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

async function createMemoryFile(
  category: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  content: string
) {
  const dir = join(TEST_DIR, category);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${filename}.md`);
  const fileContent = `${buildFrontmatter(frontmatter)}\n\n${content}\n`;
  await writeFile(filePath, fileContent, "utf-8");
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    store = new MemoryStore(TEST_DIR);
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("load", () => {
    it("should load an empty directory without errors", async () => {
      await store.load();
      const result = await store.list();
      expect(result).toEqual([]);
    });

    it("should load memories from category directories", async () => {
      await createMemoryFile(
        "decisions",
        "001-use-postgres",
        {
          title: "Use PostgreSQL",
          category: "decisions",
          date: "2024-06-01",
          tags: ["database", "architecture"],
          status: "active",
        },
        "We chose PostgreSQL for ACID compliance."
      );

      await createMemoryFile(
        "conventions",
        "naming-standards",
        {
          title: "Naming Standards",
          category: "conventions",
          date: "2024-07-01",
          tags: ["code-style"],
          status: "active",
        },
        "Use kebab-case for filenames."
      );

      await store.load();
      const result = await store.list();

      expect(result).toHaveLength(2);
      expect(result.map((m) => m.title)).toContain("Use PostgreSQL");
      expect(result.map((m) => m.title)).toContain("Naming Standards");
    });

    it("should sort memories by date descending", async () => {
      await createMemoryFile(
        "decisions",
        "old-memory",
        { title: "Old", category: "decisions", date: "2023-01-01", status: "active" },
        "Old content"
      );

      await createMemoryFile(
        "decisions",
        "new-memory",
        { title: "New", category: "decisions", date: "2025-01-01", status: "active" },
        "New content"
      );

      await store.load();
      const result = await store.list();

      expect(result[0].title).toBe("New");
      expect(result[1].title).toBe("Old");
    });
  });

  describe("search (keyword fallback)", () => {
    beforeEach(async () => {
      await createMemoryFile(
        "decisions",
        "use-postgres",
        {
          title: "Use PostgreSQL for all services",
          category: "decisions",
          date: "2024-06-01",
          tags: ["database", "architecture"],
          status: "active",
        },
        "We chose PostgreSQL over MongoDB because we need ACID transactions and complex joins."
      );

      await createMemoryFile(
        "incidents",
        "redis-outage",
        {
          title: "Redis connection pool exhaustion",
          category: "incidents",
          date: "2024-08-15",
          tags: ["redis", "outage"],
          status: "active",
        },
        "Redis connections were exhausted due to missing cleanup in worker processes."
      );

      await createMemoryFile(
        "gotchas",
        "sentry-leak",
        {
          title: "Sentry SDK memory leak",
          category: "gotchas",
          date: "2024-09-01",
          tags: ["sentry", "memory-leak"],
          status: "archived",
        },
        "Sentry SDK v8 causes memory leak with NestJS interceptors."
      );

      await store.load();
    });

    it("should find memories by title keywords", async () => {
      const results = await store.search("PostgreSQL");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain("PostgreSQL");
    });

    it("should find memories by content keywords", async () => {
      const results = await store.search("ACID transactions");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain("PostgreSQL");
    });

    it("should find memories by tag keywords", async () => {
      const results = await store.search("outage");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain("Redis");
    });

    it("should filter by category", async () => {
      const results = await store.search("memory", { category: "incidents" });
      expect(results.every((r) => r.category === "incidents")).toBe(true);
    });

    it("should exclude archived memories by default", async () => {
      const results = await store.search("Sentry");
      expect(results).toHaveLength(0);
    });

    it("should include archived memories when requested", async () => {
      const results = await store.search("Sentry", { status: "archived" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("should respect limit parameter", async () => {
      const results = await store.search("e", { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("get", () => {
    it("should return full memory entry by id", async () => {
      await createMemoryFile(
        "decisions",
        "use-postgres",
        {
          title: "Use PostgreSQL",
          category: "decisions",
          date: "2024-06-01",
          status: "active",
        },
        "Full content about PostgreSQL decision."
      );

      await store.load();
      const entry = await store.get("use-postgres");

      expect(entry).not.toBeNull();
      expect(entry!.title).toBe("Use PostgreSQL");
      expect(entry!.content).toBe("Full content about PostgreSQL decision.");
    });

    it("should return null for non-existent id", async () => {
      await store.load();
      const entry = await store.get("does-not-exist");
      expect(entry).toBeNull();
    });
  });

  describe("add", () => {
    it("should create a new memory file", async () => {
      await store.load();

      const entry = await store.add({
        title: "New Convention",
        category: "conventions",
        content: "Always use pnpm.",
        tags: ["tooling"],
        author: "joao.barros",
      });

      expect(entry.id).toMatch(/^\d{4}-\d{2}-\d{2}-new-convention$/);
      expect(entry.category).toBe("conventions");
      expect(entry.status).toBe("active");

      expect(existsSync(entry.path)).toBe(true);

      const raw = await readFile(entry.path, "utf-8");
      expect(raw).toContain("title: New Convention");
      expect(raw).toContain("author: joao.barros");
      expect(raw).toContain("Always use pnpm.");
    });

    it("should create category directory if missing", async () => {
      await store.load();

      await store.add({
        title: "A Gotcha",
        category: "gotchas",
        content: "Watch out for this.",
      });

      const dirs = await readdir(TEST_DIR);
      expect(dirs).toContain("gotchas");
    });
  });

  describe("archive", () => {
    it("should update memory status to archived", async () => {
      await createMemoryFile(
        "decisions",
        "old-decision",
        { title: "Old Decision", category: "decisions", date: "2024-01-01", status: "active" },
        "This is outdated."
      );

      await store.load();
      const archived = await store.archive("old-decision");

      expect(archived.status).toBe("archived");

      const raw = await readFile(archived.path, "utf-8");
      expect(raw).toContain("status: archived");
    });

    it("should throw for non-existent memory", async () => {
      await store.load();
      await expect(store.archive("nope")).rejects.toThrow("not found");
    });
  });

  describe("remove", () => {
    it("should delete the memory file", async () => {
      await createMemoryFile(
        "domain",
        "glossary-term",
        { title: "Glossary Term", category: "domain", date: "2024-01-01", status: "active" },
        "Definition here."
      );

      await store.load();
      expect(await store.get("glossary-term")).not.toBeNull();

      await store.remove("glossary-term");
      expect(await store.get("glossary-term")).toBeNull();
    });

    it("should throw for non-existent memory", async () => {
      await store.load();
      await expect(store.remove("nope")).rejects.toThrow("not found");
    });
  });

  describe("list", () => {
    it("should filter by category", async () => {
      await createMemoryFile(
        "decisions",
        "d1",
        { title: "D1", category: "decisions", date: "2024-01-01", status: "active" },
        "content"
      );
      await createMemoryFile(
        "conventions",
        "c1",
        { title: "C1", category: "conventions", date: "2024-01-01", status: "active" },
        "content"
      );

      await store.load();
      const decisions = await store.list({ category: "decisions" });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].category).toBe("decisions");
    });

    it("should filter by status", async () => {
      await createMemoryFile(
        "decisions",
        "active-one",
        { title: "Active", category: "decisions", date: "2024-01-01", status: "active" },
        "content"
      );
      await createMemoryFile(
        "decisions",
        "archived-one",
        { title: "Archived", category: "decisions", date: "2024-01-01", status: "archived" },
        "content"
      );

      await store.load();
      const active = await store.list({ status: "active" });
      const archived = await store.list({ status: "archived" });

      expect(active).toHaveLength(1);
      expect(active[0].title).toBe("Active");
      expect(archived).toHaveLength(1);
      expect(archived[0].title).toBe("Archived");
    });
  });
});
