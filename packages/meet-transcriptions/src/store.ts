import { readFile, readdir, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import * as lancedb from "@lancedb/lancedb";
import { EmbeddingEngine } from "./embeddings.js";
import {
  type TranscriptionEntry,
  type TranscriptionCatalogEntry,
  TranscriptionMCPError,
} from "./types.js";

function vectorRecord(entry: TranscriptionEntry, vector: number[], contentHash: string): Record<string, unknown> {
  return {
    id: entry.id, title: entry.title, date: entry.date, duration: entry.duration,
    speakers: entry.speakers.join(","),
    snippet: entry.content.length > 300 ? entry.content.slice(0, 300) + "..." : entry.content,
    content_hash: contentHash, vector,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export class TranscriptionStore {
  private transcriptionsPath: string;
  private catalog: TranscriptionEntry[] = [];
  private embeddings: EmbeddingEngine;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private loaded = false;

  constructor(transcriptionsPath: string, embeddingModel?: string) {
    this.transcriptionsPath = transcriptionsPath;
    this.embeddings = new EmbeddingEngine(embeddingModel);
  }

  async load(): Promise<void> {
    this.catalog = [];
    await this.embeddings.init();
    if (!existsSync(this.transcriptionsPath)) {
      await mkdir(this.transcriptionsPath, { recursive: true });
    }
    const files = await readdir(this.transcriptionsPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    for (const file of mdFiles) {
      const filePath = join(this.transcriptionsPath, file);
      const entry = await this.parseTranscriptionFile(filePath);
      if (entry) this.catalog.push(entry);
    }
    this.catalog.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (this.embeddings.isReady()) {
      await this.syncVectorStore();
    }
    this.loaded = true;
    console.error(`Loaded ${this.catalog.length} transcriptions`);
  }

  private async syncVectorStore(): Promise<void> {
    const dbPath = join(this.transcriptionsPath, ".lancedb");
    this.db = await lancedb.connect(dbPath);
    const records: Record<string, unknown>[] = [];
    for (const entry of this.catalog) {
      const text = this.buildEmbeddingText(entry);
      const vector = await this.embeddings.embed(text);
      records.push(vectorRecord(entry, vector, this.contentHash(text)));
    }
    if (records.length > 0) {
      this.table = await this.db.createTable("transcriptions", records, { mode: "overwrite" });
      console.error(`Indexed ${records.length} transcriptions in LanceDB`);
    } else {
      this.table = null;
    }
  }

  private buildEmbeddingText(entry: TranscriptionEntry): string {
    return [entry.title, entry.content].filter(Boolean).join("\n");
  }

  private contentHash(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  private async parseTranscriptionFile(filePath: string): Promise<TranscriptionEntry | null> {
    try {
      const raw = await readFile(filePath, "utf-8");
      const id = basename(filePath, ".md");
      const titleMatch = raw.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : id;
      const durationMatch = raw.match(/\*\*Duration:\*\*\s*(.+)/);
      const duration = durationMatch ? durationMatch[1].trim() : "unknown";
      const dateMatch = id.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})/);
      const date = dateMatch ? `${dateMatch[1]}T${dateMatch[2]}:${dateMatch[3]}:00` : new Date().toISOString();
      const separatorIdx = raw.indexOf("---");
      const content = separatorIdx !== -1 ? raw.slice(separatorIdx + 3).trim() : raw;
      const speakerMatches = content.matchAll(/\*\*(.+?):\*\*/g);
      const speakers = [...new Set([...speakerMatches].map((m) => m[1]))];
      return { id, path: filePath, title, date, duration, speakers, content };
    } catch {
      return null;
    }
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new TranscriptionMCPError("Store not loaded. Call load() first.", "NOT_LOADED");
    }
  }

  async search(
    query: string,
    opts?: { speaker?: string; limit?: number }
  ): Promise<(TranscriptionCatalogEntry & { score: number })[]> {
    this.ensureLoaded();
    const limit = opts?.limit || 10;
    if (this.embeddings.isReady() && this.table) {
      const results = await this.semanticSearch(query, limit);
      return opts?.speaker
        ? results.filter((r) => r.speakers.some((s) => s.toLowerCase().includes(opts.speaker!.toLowerCase())))
        : results;
    }
    let filtered = [...this.catalog];
    if (opts?.speaker) {
      filtered = filtered.filter((t) =>
        t.speakers.some((s) => s.toLowerCase().includes(opts.speaker!.toLowerCase()))
      );
    }
    return this.keywordSearch(query, filtered, limit);
  }

  private async semanticSearch(
    query: string,
    limit: number
  ): Promise<(TranscriptionCatalogEntry & { score: number })[]> {
    const queryVector = await this.embeddings.embed(query);
    const results = await this.table!.search(queryVector).limit(limit).toArray();
    return results.map((row: Record<string, unknown>) => ({
      id: row.id as string, title: row.title as string, date: row.date as string,
      duration: row.duration as string,
      speakers: (row.speakers as string).split(",").filter(Boolean),
      snippet: row.snippet as string,
      score: round(1 - ((row._distance as number) || 0)),
    }));
  }

  private keywordSearch(
    query: string,
    entries: TranscriptionEntry[],
    limit: number
  ): (TranscriptionCatalogEntry & { score: number })[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = entries.map((entry) => {
      let score = 0;
      for (const term of queryTerms) {
        if (entry.title.toLowerCase().includes(term)) score += 10;
        if (entry.content.toLowerCase().includes(term)) score += 3;
      }
      return { entry, score: score / 10 };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({ ...this.toCatalogEntry(s.entry), score: round(s.score) }));
  }

  list(opts?: { limit?: number }): TranscriptionCatalogEntry[] {
    this.ensureLoaded();
    const limit = opts?.limit || 20;
    return this.catalog.slice(0, limit).map((e) => this.toCatalogEntry(e));
  }

  get(id: string): TranscriptionEntry | null {
    this.ensureLoaded();
    return this.catalog.find((t) => t.id === id) || null;
  }

  private toCatalogEntry(entry: TranscriptionEntry): TranscriptionCatalogEntry {
    const snippet = entry.content.length > 300 ? entry.content.slice(0, 300) + "..." : entry.content;
    return { id: entry.id, title: entry.title, date: entry.date, duration: entry.duration, speakers: entry.speakers, snippet };
  }
}
