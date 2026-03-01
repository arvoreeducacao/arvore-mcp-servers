type Pipeline = (
  texts: string[],
  options?: Record<string, unknown>
) => Promise<{ tolist: () => number[][] }>;

const DEFAULT_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export class EmbeddingEngine {
  private pipeline: Pipeline | null = null;
  private modelName: string;
  private ready = false;

  constructor(modelName?: string) {
    this.modelName =
      modelName || process.env.MCP_PROXY_EMBEDDING_MODEL || DEFAULT_MODEL;
  }

  async init(): Promise<void> {
    try {
      const { pipeline } = await import("@xenova/transformers");
      this.pipeline = (await pipeline(
        "feature-extraction",
        this.modelName
      )) as unknown as Pipeline;
      this.ready = true;
      console.error(`[embeddings] Engine ready (model: ${this.modelName})`);
    } catch (error) {
      console.error(
        `[embeddings] Failed to init: ${error instanceof Error ? error.message : error}. Falling back to lexical search.`
      );
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) throw new Error("Embedding engine not initialized");
    const output = await this.pipeline([text], {
      pooling: "mean",
      normalize: true,
    });
    return output.tolist()[0];
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
