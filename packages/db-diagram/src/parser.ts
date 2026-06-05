import { Schema, Table, Column, ForeignKey } from "./types.js";

export function parseDDL(ddl: string): Schema {
  const tables: Table[] = [];
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;|\n\n)/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(ddl)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const table = parseTableBody(tableName, body);
    tables.push(table);
  }

  if (tables.length === 0) {
    const simpleRegex =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)/gi;
    while ((match = simpleRegex.exec(ddl)) !== null) {
      const tableName = match[1];
      const body = match[2];
      const table = parseTableBody(tableName, body);
      tables.push(table);
    }
  }

  return { tables };
}

function parseTableBody(tableName: string, body: string): Table {
  const columns: Column[] = [];
  const foreignKeys: ForeignKey[] = [];
  const primaryKeyColumns: string[] = [];

  const lines = splitTableBody(body);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const pkMatch = trimmed.match(
      /^\s*(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i
    );
    if (pkMatch) {
      const cols = pkMatch[1]
        .split(",")
        .map((c) => c.trim().replace(/[`"']/g, ""));
      primaryKeyColumns.push(...cols);
      continue;
    }

    const fkMatch = trimmed.match(
      /^\s*(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i
    );
    if (fkMatch) {
      foreignKeys.push({
        columns: fkMatch[1]
          .split(",")
          .map((c) => c.trim().replace(/[`"']/g, "")),
        referencedTable: fkMatch[2],
        referencedColumns: fkMatch[3]
          .split(",")
          .map((c) => c.trim().replace(/[`"']/g, "")),
      });
      continue;
    }

    const uniqueConstraint = trimmed.match(
      /^\s*(?:CONSTRAINT\s+[`"']?\w+[`"']?\s+)?UNIQUE\s+(?:KEY|INDEX)?\s*(?:[`"']?\w+[`"']?\s*)?\(([^)]+)\)/i
    );
    if (uniqueConstraint) continue;

    const indexMatch = trimmed.match(/^\s*(?:KEY|INDEX)\s/i);
    if (indexMatch) continue;

    const column = parseColumn(trimmed);
    if (column) columns.push(column);
  }

  for (const col of columns) {
    if (primaryKeyColumns.includes(col.name)) {
      col.primaryKey = true;
    }
  }

  return { name: tableName, columns, foreignKeys };
}

function splitTableBody(body: string): string[] {
  const lines: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (const char of body) {
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "," && parenDepth === 0) {
      lines.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  return lines;
}

function parseColumn(line: string): Column | null {
  const match = line.match(
    /^\s*[`"']?(\w+)[`"']?\s+([\w(),.]+(?:\s*\(\d+(?:,\s*\d+)?\))?)/i
  );
  if (!match) return null;

  const name = match[1];
  const type = match[2].toUpperCase();

  const upperLine = line.toUpperCase();
  const nullable = !upperLine.includes("NOT NULL");
  const primaryKey =
    upperLine.includes("PRIMARY KEY") ||
    (upperLine.includes("SERIAL") && !upperLine.includes("BIGSERIAL"));
  const unique =
    upperLine.includes("UNIQUE") || upperLine.includes("PRIMARY KEY");

  let defaultValue: string | undefined;
  const defaultMatch = line.match(/DEFAULT\s+([^,\s]+)/i);
  if (defaultMatch) defaultValue = defaultMatch[1].replace(/['"]/g, "");

  const inlineFkMatch = line.match(
    /REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i
  );

  return {
    name,
    type,
    nullable,
    primaryKey,
    unique,
    defaultValue,
    ...(inlineFkMatch ? { _inlineRef: inlineFkMatch } : {}),
  } as Column;
}

export function extractInlineForeignKeys(ddl: string, schema: Schema): Schema {
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)(?:\s*(?:ENGINE|;|\n\n))/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(ddl)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const table = schema.tables.find((t) => t.name === tableName);
    if (!table) continue;

    const lines = splitTableBody(body);
    for (const line of lines) {
      const colMatch = line.match(/^\s*[`"']?(\w+)[`"']?\s+/);
      const fkMatch = line.match(
        /REFERENCES\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)/i
      );
      if (colMatch && fkMatch) {
        const colName = colMatch[1].replace(/[`"']/g, "");
        const refTable = fkMatch[1];
        const refCols = fkMatch[2]
          .split(",")
          .map((c) => c.trim().replace(/[`"']/g, ""));

        const exists = table.foreignKeys.some(
          (fk) =>
            fk.columns.includes(colName) && fk.referencedTable === refTable
        );
        if (!exists) {
          table.foreignKeys.push({
            columns: [colName],
            referencedTable: refTable,
            referencedColumns: refCols,
          });
        }
      }
    }
  }

  return schema;
}
