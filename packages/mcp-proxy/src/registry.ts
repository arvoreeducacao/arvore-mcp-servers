import { RegistryEntry } from "./types.js";
import { EmbeddingEngine } from "./embeddings.js";

export class ToolRegistry {
  private tools = new Map<string, RegistryEntry>();

  constructor(private readonly embeddings?: EmbeddingEngine) {}

  register(entry: RegistryEntry): void {
    this.tools.set(entry.ref, entry);
  }

  get(ref: string): RegistryEntry | undefined {
    return this.tools.get(ref);
  }

  getAll(): RegistryEntry[] {
    return Array.from(this.tools.values());
  }

  getByProvider(provider: string): RegistryEntry[] {
    return this.getAll().filter((t) => t.provider === provider);
  }

  clear(): void {
    this.tools.clear();
  }

  get size(): number {
    return this.tools.size;
  }

  async ingestUpstreamTool(
    provider: string,
    toolName: string,
    description: string,
    inputSchema: Record<string, unknown>
  ): Promise<RegistryEntry> {
    const ref = `t:${provider}.${toolName}`;
    const mainParams = this.extractMainParams(inputSchema);
    const tags = this.generateTags(provider, toolName, description);
    const example = this.generateExample(mainParams);

    let embedding: number[] | undefined;
    if (this.embeddings?.isReady()) {
      try {
        const embeddingText = [
          provider,
          this.humanize(toolName),
          description,
          ...tags,
          ...mainParams,
        ].join(" ");
        embedding = await this.embeddings.embed(embeddingText);
      } catch (error) {
        console.error(
          `[registry] Failed to embed tool ${ref}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    const entry: RegistryEntry = {
      ref,
      provider,
      originalName: toolName,
      title: this.truncate(this.humanize(toolName), 60),
      description: this.truncate(description, 120),
      mainParams,
      example,
      tags,
      embedding,
      _inputSchema: JSON.parse(JSON.stringify(inputSchema)),
    };

    this.register(entry);
    return entry;
  }

  private extractMainParams(schema: Record<string, unknown>): string[] {
    const properties = (schema as { properties?: Record<string, unknown> })
      .properties;
    if (!properties) return [];
    const required = new Set(
      (schema as { required?: string[] }).required || []
    );
    const sorted = Object.keys(properties).sort((a, b) => {
      const aReq = required.has(a) ? 0 : 1;
      const bReq = required.has(b) ? 0 : 1;
      return aReq - bReq;
    });
    return sorted.slice(0, 5);
  }

  private generateTags(
    provider: string,
    toolName: string,
    description: string
  ): string[] {
    const tags = [provider];
    const parts = toolName.split(/[._\-/]/).filter(Boolean);
    tags.push(...parts);
    const words = description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 5);
    tags.push(...words);
    return [...new Set(tags)];
  }

  private generateExample(params: string[]): Record<string, unknown> {
    const example: Record<string, unknown> = {};
    for (const p of params.slice(0, 3)) {
      example[p] = `<${p}>`;
    }
    return example;
  }

  private humanize(name: string): string {
    return name
      .replace(/[._\-/]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
  }
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "have",
  "been", "are", "was", "were", "being", "does", "did", "doing", "would",
  "could", "should", "about", "into", "through", "during", "before",
  "after", "above", "below", "between", "under", "again", "further",
  "then", "once", "here", "there", "when", "where", "which", "while",
  "each", "every", "both", "some", "such", "only", "other", "than",
]);
