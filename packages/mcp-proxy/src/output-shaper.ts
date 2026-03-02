import { Shaped } from "./types.js";

const STRIP_FIELDS = new Set([
  "id",
  "uuid",
  "url",
  "html_url",
  "api_url",
  "self",
  "metadata",
  "created_at",
  "updated_at",
  "deleted_at",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "_links",
  "_embedded",
  "node_id",
  "avatar_url",
  "gravatar_id",
]);

const KEEP_FIELDS = new Set(["title", "name", "key", "status", "state", "type", "description", "body", "content"]);

export class OutputShaper {
  private refCounter = 0;
  private refMap = new Map<string, string>();
  private reverseRefMap = new Map<string, string>();

  constructor(
    private maxItems: number = 20,
    private maxTextLength: number = 500
  ) {}

  shapeResponse(
    data: unknown,
    provider: string,
    detail = false,
    offset = 0
  ): { items: Shaped[]; hasMore: boolean; rawCount: number } {
    const items = this.extractItems(data);
    const rawCount = items.length;
    const limited = items.slice(offset, offset + this.maxItems);
    const shaped = limited.map((item) => this.shapeItem(item, provider, detail));
    return { items: shaped, hasMore: rawCount > offset + this.maxItems, rawCount };
  }

  shapeItem(
    item: Record<string, unknown>,
    provider: string,
    detail = false
  ): Shaped {
    const originalId = this.findId(item);
    const ref = this.getOrCreateRef(originalId, provider);
    const shaped: Shaped = { ref };

    for (const [key, value] of Object.entries(item)) {
      if (this.shouldStrip(key, detail)) continue;
      shaped[key] = this.truncateValue(value, detail);
    }

    return shaped;
  }

  resolveRef(shortRef: string): string | undefined {
    return this.refMap.get(shortRef);
  }

  getRefMap(): ReadonlyMap<string, string> {
    return this.refMap;
  }

  private extractItems(data: unknown): Record<string, unknown>[] {
    if (data == null) return [];
    if (typeof data === "string") {
      const parsed = this.tryParseCsv(data);
      if (parsed) return parsed;
      return [{ value: data }];
    }
    if (typeof data === "number" || typeof data === "boolean") {
      return [{ value: data }];
    }
    if (Array.isArray(data)) {
      if (data.every((v) => this.isObject(v))) return data as Record<string, unknown>[];
      if (data.some((v) => this.isObject(v))) return data.filter(this.isObject);
      return data.map((v, i) => ({ index: i, value: v }));
    }
    if (this.isObject(data)) {
      for (const key of ["items", "data", "results", "nodes", "edges", "records", "rows", "entries", "list"]) {
        const val = (data as Record<string, unknown>)[key];
        if (Array.isArray(val)) {
          if (val.every((v) => this.isObject(v))) return val as Record<string, unknown>[];
          if (val.some((v) => this.isObject(v))) return val.filter(this.isObject);
          return val.map((v, i) => ({ index: i, value: v }));
        }
      }
      return [data as Record<string, unknown>];
    }
    return [];
  }

  private tryParseCsv(data: string): Record<string, unknown>[] | null {
    const lines = data.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return null;

    const header = this.parseCsvLine(lines[0]);
    if (header.length < 2) return null;

    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.length === 0) continue;
      const row: Record<string, unknown> = {};
      for (let j = 0; j < header.length; j++) {
        row[header[j]] = values[j] ?? "";
      }
      rows.push(row);
    }

    return rows.length > 0 ? rows : null;
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }


  private isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  private findId(item: Record<string, unknown>): string {
    for (const key of ["id", "uuid", "key", "identifier", "number", "slug"]) {
      if (item[key] != null) return String(item[key]);
    }
    return `anon_${++this.refCounter}`;
  }

  private getOrCreateRef(originalId: string, provider: string): string {
    const existing = this.reverseRefMap.get(`${provider}:${originalId}`);
    if (existing) return existing;

    const prefix = provider.slice(0, 3);
    const shortRef = `${prefix}_${++this.refCounter}`;
    this.refMap.set(shortRef, originalId);
    this.reverseRefMap.set(`${provider}:${originalId}`, shortRef);
    return shortRef;
  }

  private shouldStrip(key: string, detail: boolean): boolean {
    if (KEEP_FIELDS.has(key)) return false;
    if (detail) return false;
    return STRIP_FIELDS.has(key) || key.startsWith("_");
  }

  private truncateValue(value: unknown, detail: boolean): unknown {
    const limit = detail ? this.maxTextLength * 3 : this.maxTextLength;
    if (typeof value === "string" && value.length > limit) {
      return value.slice(0, limit) + "…";
    }
    if (Array.isArray(value) && !detail) {
      return value.slice(0, 5);
    }
    return value;
  }
}
