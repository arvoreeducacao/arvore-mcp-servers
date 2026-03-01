import { RegistryEntry, SearchResult } from "./types.js";
import { ToolRegistry } from "./registry.js";
import { EmbeddingEngine } from "./embeddings.js";

export class HybridSearch {
  private readonly LEXICAL_WEIGHT = 0.4;
  private readonly SEMANTIC_WEIGHT = 0.6;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly embeddings: EmbeddingEngine
  ) {}

  async search(query: string, limit: number): Promise<SearchResult[]> {
    const tools = this.registry.getAll();
    if (tools.length === 0) return [];

    const queryTokens = this.tokenize(query);
    const providerHint = this.detectProvider(query, tools);

    const lexicalScores = tools.map((tool) => ({
      tool,
      score: this.lexicalScore(tool, queryTokens, providerHint),
    }));

    const maxLexical = Math.max(...lexicalScores.map((s) => s.score), 1);

    if (this.embeddings.isReady()) {
      try {
        const queryEmbedding = await this.embeddings.embed(query);

        const scored = lexicalScores.map(({ tool, score: lexScore }) => {
          const normalizedLex = lexScore / maxLexical;
          let semanticScore = 0;

          if (tool.embedding && tool.embedding.length > 0) {
            semanticScore = this.embeddings.cosineSimilarity(
              queryEmbedding,
              tool.embedding
            );
            semanticScore = Math.max(0, semanticScore);
          }

          const finalScore =
            this.LEXICAL_WEIGHT * normalizedLex +
            this.SEMANTIC_WEIGHT * semanticScore;

          return { tool, score: finalScore };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored
          .filter((s) => s.score > 0.05)
          .slice(0, limit)
          .map((s) => this.toSearchResult(s.tool));
      } catch (error) {
        console.error(
          `[search] Semantic search failed, falling back to lexical:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    lexicalScores.sort((a, b) => b.score - a.score);
    return lexicalScores
      .filter((s) => s.score > 0)
      .slice(0, limit)
      .map((s) => this.toSearchResult(s.tool));
  }

  private lexicalScore(
    tool: RegistryEntry,
    queryTokens: string[],
    providerHint: string | null
  ): number {
    let score = 0;

    if (providerHint && tool.provider === providerHint) {
      score += 3;
    }

    const toolTokens = new Set([
      ...this.tokenize(tool.title),
      ...this.tokenize(tool.description),
      ...tool.tags,
      ...tool.mainParams.map((p) => p.toLowerCase()),
    ]);

    for (const qt of queryTokens) {
      if (toolTokens.has(qt)) {
        score += 2;
        continue;
      }
      for (const tt of toolTokens) {
        if (tt.includes(qt) || qt.includes(tt)) {
          score += 1;
          break;
        }
      }
    }

    const toolNameLower = tool.originalName.toLowerCase();
    for (const qt of queryTokens) {
      if (toolNameLower.includes(qt)) {
        score += 1.5;
      }
    }

    return score;
  }

  private detectProvider(
    query: string,
    tools: RegistryEntry[]
  ): string | null {
    const lower = query.toLowerCase();
    const providers = [...new Set(tools.map((t) => t.provider))];
    for (const p of providers) {
      if (lower.includes(p.toLowerCase())) return p;
    }
    return null;
  }

  private toSearchResult(tool: RegistryEntry): SearchResult {
    return {
      ref: tool.ref,
      title: tool.title,
      hint: `${tool.description} Params: ${tool.mainParams.join(", ")}`,
      example: tool.example,
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
