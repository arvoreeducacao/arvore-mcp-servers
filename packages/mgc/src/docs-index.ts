import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

interface IndexedDoc {
  filepath: string;
  url: string;
  title: string;
  content: string;
  terms: Map<string, number>;
  termCount: number;
}

export class DocsIndex {
  private docs: IndexedDoc[] = [];
  private idf: Map<string, number> = new Map();
  private loaded = false;
  private docsDir: string;

  constructor(docsDir: string) {
    this.docsDir = docsDir;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    const files = await this.findMarkdownFiles(this.docsDir);

    const manifestMap = new Map<string, string>();
    try {
      const manifestRaw = await readFile(join(this.docsDir, "_manifest.json"), "utf-8");
      const manifest: Array<{ url: string; filepath: string }> = JSON.parse(manifestRaw);
      for (const entry of manifest) {
        manifestMap.set(entry.filepath, entry.url);
      }
    } catch (_e) { /* manifest may not exist */ }

    for (const file of files) {
      if (file.endsWith("_all.md") || file.endsWith("_manifest.json")) continue;

      const content = await readFile(file, "utf-8");
      const title = this.extractTitle(content);
      const terms = this.tokenize(content);
      const termFreq = this.computeTermFrequency(terms);
      const url = manifestMap.get(file) || this.filepathToUrl(file);

      this.docs.push({
        filepath: relative(this.docsDir, file),
        url,
        title,
        content,
        terms: termFreq,
        termCount: terms.length,
      });
    }

    this.computeIDF();
    this.loaded = true;
    console.error(`Docs index loaded: ${this.docs.length} documents from ${this.docsDir}`);
  }

  search(query: string, maxResults = 5): Array<{ url: string; title: string; snippet: string; score: number; filepath: string }> {
    const queryTerms = this.tokenize(query);
    if (!queryTerms.length) return [];

    const scores: Array<{ doc: IndexedDoc; score: number }> = [];

    for (const doc of this.docs) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = (doc.terms.get(term) || 0) / Math.max(doc.termCount, 1);
        const idf = this.idf.get(term) || 0;
        score += tf * idf;
      }

      const titleBonus = queryTerms.some((t) => doc.title.toLowerCase().includes(t)) ? 2 : 1;
      score *= titleBonus;

      if (score > 0) {
        scores.push({ doc, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, maxResults).map(({ doc, score }) => ({
      url: doc.url,
      title: doc.title,
      snippet: this.extractSnippet(doc.content, queryTerms),
      score: Math.round(score * 10000) / 10000,
      filepath: doc.filepath,
    }));
  }

  getDocContent(filepath: string): string | null {
    const doc = this.docs.find((d) => d.filepath === filepath);
    return doc?.content ?? null;
  }

  get documentCount(): number {
    return this.docs.length;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private computeTermFrequency(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) || 0) + 1);
    }
    return freq;
  }

  private computeIDF(): void {
    const docFreq = new Map<string, number>();
    for (const doc of this.docs) {
      for (const term of doc.terms.keys()) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }

    const n = this.docs.length;
    for (const [term, df] of docFreq) {
      this.idf.set(term, Math.log(1 + n / df));
    }
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim() || "Untitled";
  }

  private extractSnippet(content: string, queryTerms: string[]): string {
    const lines = content.split("\n").filter((l) => l.trim());
    const lower = queryTerms.map((t) => t.toLowerCase());

    for (const line of lines) {
      if (lower.some((t) => line.toLowerCase().includes(t))) {
        return line.slice(0, 300);
      }
    }

    return lines.slice(0, 3).join(" ").slice(0, 300);
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...(await this.findMarkdownFiles(fullPath)));
        } else if (entry.name.endsWith(".md")) {
          results.push(fullPath);
        }
      }
    } catch (_e) { /* directory may not exist */ }
    return results;
  }

  private filepathToUrl(filepath: string): string {
    const rel = relative(this.docsDir, filepath).replace(/\.md$/, "");
    return `https://docs.magalu.cloud/docs/${rel}`;
  }
}
