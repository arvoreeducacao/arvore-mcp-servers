import { Schema, Table } from "./types.js";

export function generateErd(
  schema: Schema,
  options?: { tables?: string[]; title?: string }
): string {
  const filteredTables = options?.tables
    ? schema.tables.filter((t) => options.tables!.includes(t.name))
    : schema.tables;

  if (filteredTables.length === 0) return "erDiagram";

  const lines: string[] = [];
  if (options?.title) lines.push(`---\ntitle: ${options.title}\n---`);
  lines.push("erDiagram");

  for (const table of filteredTables) {
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const markers: string[] = [];
      if (col.primaryKey) markers.push("PK");
      if (col.unique && !col.primaryKey) markers.push("UK");

      const isFk = schema.tables.some((t) =>
        t.foreignKeys.some(
          (fk) =>
            fk.referencedTable === table.name &&
            fk.referencedColumns.includes(col.name)
        )
      );
      const isLocalFk = table.foreignKeys.some((fk) =>
        fk.columns.includes(col.name)
      );
      if (isFk || isLocalFk) markers.push("FK");

      const markerStr = markers.length > 0 ? ` ${markers.join(",")}` : "";
      lines.push(
        `        ${normalizeType(col.type)} ${col.name}${markerStr}`
      );
    }
    lines.push("    }");
  }

  const tableNames = new Set(filteredTables.map((t) => t.name));
  for (const table of filteredTables) {
    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.referencedTable)) continue;

      const cardinality = inferCardinality(table, fk.columns);
      lines.push(
        `    ${fk.referencedTable} ${cardinality} ${table.name} : "${fk.columns.join(", ")}"`
      );
    }
  }

  return lines.join("\n");
}

export function generateDomainMap(
  schema: Schema,
  entryTable: string,
  depth: number
): string {
  const visited = new Set<string>();
  const queue: Array<{ table: string; level: number }> = [
    { table: entryTable, level: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.table) || current.level > depth) continue;
    visited.add(current.table);

    const table = schema.tables.find((t) => t.name === current.table);
    if (!table) continue;

    for (const fk of table.foreignKeys) {
      if (!visited.has(fk.referencedTable)) {
        queue.push({ table: fk.referencedTable, level: current.level + 1 });
      }
    }

    for (const other of schema.tables) {
      for (const fk of other.foreignKeys) {
        if (
          fk.referencedTable === current.table &&
          !visited.has(other.name)
        ) {
          queue.push({ table: other.name, level: current.level + 1 });
        }
      }
    }
  }

  const filteredSchema: Schema = {
    tables: schema.tables.filter((t) => visited.has(t.name)),
  };

  return generateErd(filteredSchema, {
    title: `Domain: ${entryTable} (depth ${depth})`,
  });
}

export function explainTable(schema: Schema, tableName: string): string {
  const table = schema.tables.find((t) => t.name === tableName);
  if (!table) return `Table "${tableName}" not found in schema.`;

  const lines: string[] = [`# ${tableName}`, ""];

  lines.push("## Columns", "");
  lines.push("| Column | Type | PK | Nullable | Unique | Default |");
  lines.push("|--------|------|----|---------:|--------|---------|");
  for (const col of table.columns) {
    lines.push(
      `| ${col.name} | ${col.type} | ${col.primaryKey ? "✓" : ""} | ${col.nullable ? "✓" : ""} | ${col.unique ? "✓" : ""} | ${col.defaultValue ?? ""} |`
    );
  }

  if (table.foreignKeys.length > 0) {
    lines.push("", "## Foreign Keys (outgoing)", "");
    for (const fk of table.foreignKeys) {
      lines.push(
        `- ${fk.columns.join(", ")} → ${fk.referencedTable}(${fk.referencedColumns.join(", ")})`
      );
    }
  }

  const incomingFks = schema.tables.filter((t) =>
    t.foreignKeys.some((fk) => fk.referencedTable === tableName)
  );
  if (incomingFks.length > 0) {
    lines.push("", "## Referenced By (incoming)", "");
    for (const t of incomingFks) {
      for (const fk of t.foreignKeys) {
        if (fk.referencedTable === tableName) {
          lines.push(
            `- ${t.name}(${fk.columns.join(", ")}) → ${tableName}(${fk.referencedColumns.join(", ")})`
          );
        }
      }
    }
  }

  const relatedTables = new Set<string>();
  for (const fk of table.foreignKeys) relatedTables.add(fk.referencedTable);
  for (const t of incomingFks) relatedTables.add(t.name);

  if (relatedTables.size > 0) {
    const miniSchema: Schema = {
      tables: schema.tables.filter(
        (t) => t.name === tableName || relatedTables.has(t.name)
      ),
    };
    lines.push("", "## Diagram", "", "```mermaid");
    lines.push(generateErd(miniSchema, { title: tableName }));
    lines.push("```");
  }

  return lines.join("\n");
}

export function traceFlow(
  schema: Schema,
  from: string,
  to: string
): string {
  const paths = findPaths(schema, from, to, 6);

  if (paths.length === 0) {
    return `No relationship path found between "${from}" and "${to}" within 6 hops.`;
  }

  const allTables = new Set<string>();
  for (const path of paths) {
    for (const table of path) allTables.add(table);
  }

  const lines: string[] = [
    `# Flow: ${from} → ${to}`,
    "",
    `Found ${paths.length} path(s):`,
    "",
  ];

  for (let i = 0; i < paths.length; i++) {
    lines.push(`${i + 1}. ${paths[i].join(" → ")}`);
  }

  const filteredSchema: Schema = {
    tables: schema.tables.filter((t) => allTables.has(t.name)),
  };

  lines.push("", "```mermaid");
  lines.push(generateErd(filteredSchema, { title: `${from} → ${to}` }));
  lines.push("```");

  return lines.join("\n");
}

function findPaths(
  schema: Schema,
  from: string,
  to: string,
  maxDepth: number
): string[][] {
  const results: string[][] = [];

  function dfs(current: string, target: string, path: string[]): void {
    if (path.length > maxDepth) return;
    if (current === target) {
      results.push([...path]);
      return;
    }

    const table = schema.tables.find((t) => t.name === current);
    if (!table) return;

    for (const fk of table.foreignKeys) {
      if (!path.includes(fk.referencedTable)) {
        path.push(fk.referencedTable);
        dfs(fk.referencedTable, target, path);
        path.pop();
      }
    }

    for (const other of schema.tables) {
      for (const fk of other.foreignKeys) {
        if (fk.referencedTable === current && !path.includes(other.name)) {
          path.push(other.name);
          dfs(other.name, target, path);
          path.pop();
        }
      }
    }
  }

  dfs(from, to, [from]);
  return results.slice(0, 5);
}

function inferCardinality(table: Table, fkColumns: string[]): string {
  const hasUnique = table.columns.some(
    (c) => fkColumns.includes(c.name) && (c.unique || c.primaryKey)
  );
  return hasUnique ? "||--||" : "||--o{";
}

function normalizeType(type: string): string {
  return type.replace(/[(),\s]/g, "_").replace(/_+$/, "");
}
