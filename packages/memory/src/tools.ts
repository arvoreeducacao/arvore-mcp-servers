import { MemoryStore } from "./store.js";
import {
  type ReadMemoriesParams,
  type WriteMemoryParams,
  type MemoryCatalogEntry,
  type McpToolResult,
  VALID_CATEGORIES,
  MemoryMCPError,
} from "./types.js";

export interface MemoryToolsOptions {
  author?: string;
}

export class MemoryMCPTools {
  constructor(
    private store: MemoryStore,
    private options: MemoryToolsOptions = {}
  ) {}

  async readMemories(params: ReadMemoriesParams): Promise<McpToolResult> {
    try {
      if (params.id) return await this.readOne(params.id);
      if (params.query) return await this.readSearch(params);
      return await this.readIndex(params);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async writeMemory(params: WriteMemoryParams): Promise<McpToolResult> {
    try {
      if (params.action === "archive") return await this.archive(params);
      if (params.action === "delete") return await this.remove(params);
      if (params.id) return await this.updateExisting(params);
      return await this.create(params);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async readOne(id: string): Promise<McpToolResult> {
    const entry = await this.store.get(id);

    if (!entry) {
      const similar = await this.store.search(id.replace(/[-_]/g, " "), { limit: 5 });
      return this.json({
        found: false,
        id,
        message: `Memory "${id}" not found.`,
        didYouMean: similar.map((s) => ({ id: s.id, title: s.title })),
      });
    }

    return this.json({
      found: true,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      date: entry.date,
      updated: entry.updated,
      author: entry.author,
      tags: entry.tags,
      status: entry.status,
      content: entry.content,
    });
  }

  private async readSearch(params: ReadMemoriesParams): Promise<McpToolResult> {
    const results = await this.store.search(params.query as string, {
      category: params.category,
      status: params.status ?? "active",
      tags: params.tags,
      author: params.author,
      limit: params.limit,
    });

    return this.json({
      mode: "search",
      query: params.query,
      count: results.length,
      results,
      next: results.length > 0 ? "Call read_memories with the id of the relevant result." : undefined,
    });
  }

  private async readIndex(params: ReadMemoriesParams): Promise<McpToolResult> {
    const status = params.status ?? "active";
    const entries = await this.store.list({
      category: params.category,
      status,
      tags: params.tags,
      author: params.author,
      limit: params.limit,
    });

    const total = await this.store.count({ status });
    const grouped = new Map<string, MemoryCatalogEntry[]>();

    for (const entry of entries) {
      const list = grouped.get(entry.category) || [];
      list.push(entry);
      grouped.set(entry.category, list);
    }

    const categories = VALID_CATEGORIES.filter((category) => grouped.has(category)).map(
      (category) => ({
        category,
        count: grouped.get(category)!.length,
        memories: grouped.get(category)!.map((entry) => ({
          id: entry.id,
          title: entry.title,
          date: entry.date,
          updated: entry.updated,
          author: entry.author,
          tags: entry.tags,
          snippet: entry.snippet,
        })),
      })
    );

    return this.json({
      mode: "index",
      status,
      showing: entries.length,
      total,
      truncated: entries.length < total,
      categories,
      next: "Call read_memories with an id to open one, or with query to search by meaning.",
    });
  }

  private async create(params: WriteMemoryParams): Promise<McpToolResult> {
    const missing = (["title", "category", "content"] as const).filter((field) => !params[field]);

    if (missing.length > 0) {
      return this.json({
        saved: false,
        reason: "missing_fields",
        missing,
        message: `To create a memory, send title, category and content. Categories: ${VALID_CATEGORIES.join(", ")}.`,
      });
    }

    if (!params.force) {
      const similar = await this.store.findSimilar(params.content!, params.title!);
      if (similar) {
        return this.json({
          saved: false,
          reason: "similar_memory_exists",
          message:
            "A very similar memory already exists. Read it and, if this is new information, call write_memory again with that id to update it — or with force: true to create a separate one.",
          similar: {
            id: similar.id,
            title: similar.title,
            category: similar.category,
            score: similar.score,
          },
        });
      }
    }

    const entry = await this.store.add({
      title: params.title!,
      category: params.category!,
      content: params.content!,
      tags: params.tags,
      author: this.options.author,
    });

    return this.json({
      saved: true,
      created: true,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      date: entry.date,
      author: entry.author,
      tags: entry.tags,
    });
  }

  private async updateExisting(params: WriteMemoryParams): Promise<McpToolResult> {
    const entry = await this.store.update(params.id!, {
      title: params.title,
      content: params.content,
      tags: params.tags,
      category: params.category,
      status: params.status,
      author: this.options.author,
    });

    return this.json({
      saved: true,
      created: false,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      status: entry.status,
      updated: entry.updated,
      author: entry.author,
      tags: entry.tags,
    });
  }

  private async archive(params: WriteMemoryParams): Promise<McpToolResult> {
    if (!params.id) {
      return this.json({
        saved: false,
        reason: "missing_fields",
        missing: ["id"],
        message: "archive requires the id of the memory to retire.",
      });
    }

    const entry = await this.store.archive(params.id);

    return this.json({
      saved: true,
      action: "archive",
      id: entry.id,
      title: entry.title,
      status: entry.status,
    });
  }

  private async remove(params: WriteMemoryParams): Promise<McpToolResult> {
    if (!params.id) {
      return this.json({
        saved: false,
        reason: "missing_fields",
        missing: ["id"],
        message: "delete requires the id of the memory to remove.",
      });
    }

    await this.store.remove(params.id);

    return this.json({ saved: true, action: "delete", id: params.id });
  }

  private json(value: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
  }

  private errorResult(error: unknown): McpToolResult {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof MemoryMCPError ? error.code : "UNKNOWN_ERROR";

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message, code }, null, 2) }],
      isError: true,
    };
  }
}
