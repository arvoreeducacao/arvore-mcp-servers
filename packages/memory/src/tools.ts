import { MemoryStore } from "./store.js";
import {
  type SearchMemoriesParams,
  type GetMemoryParams,
  type AddMemoryParams,
  type ListMemoriesParams,
  type RemoveMemoryParams,
  type ArchiveMemoryParams,
  type McpToolResult,
  MemoryMCPError,
} from "./types.js";

export class MemoryMCPTools {
  constructor(private store: MemoryStore) {}

  async searchMemories(params: SearchMemoriesParams): Promise<McpToolResult> {
    try {
      const results = await this.store.search(params.query, {
        category: params.category,
        status: params.status,
        limit: params.limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query: params.query,
                count: results.length,
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async getMemory(params: GetMemoryParams): Promise<McpToolResult> {
    try {
      const entry = this.store.get(params.id);

      if (!entry) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { error: `Memory "${params.id}" not found` },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: entry.id,
                title: entry.title,
                category: entry.category,
                date: entry.date,
                author: entry.author,
                tags: entry.tags,
                status: entry.status,
                content: entry.content,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async addMemory(params: AddMemoryParams): Promise<McpToolResult> {
    try {
      const entry = await this.store.add(params);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                created: true,
                id: entry.id,
                path: entry.path,
                title: entry.title,
                category: entry.category,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async listMemories(params: ListMemoriesParams): Promise<McpToolResult> {
    try {
      const results = this.store.list({
        category: params.category,
        status: params.status,
        limit: params.limit,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: results.length,
                memories: results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async removeMemory(params: RemoveMemoryParams): Promise<McpToolResult> {
    try {
      await this.store.remove(params.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ removed: true, id: params.id }, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async archiveMemory(params: ArchiveMemoryParams): Promise<McpToolResult> {
    try {
      const entry = await this.store.archive(params.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { archived: true, id: entry.id, title: entry.title },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private errorResult(error: unknown): McpToolResult {
    const message =
      error instanceof MemoryMCPError
        ? `Memory Error: ${error.message}`
        : `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`;

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
