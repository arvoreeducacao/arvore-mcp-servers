import { ClickHouseConnection } from "./database.js";
import {
  ReadQueryParams,
  DescribeTableParams,
  McpToolResult,
  ClickHouseMCPError,
} from "./types.js";

export class ClickHouseMCPTools {
  constructor(private db: ClickHouseConnection) {}

  async readQuery(params: ReadQueryParams): Promise<McpToolResult> {
    try {
      const result = await this.db.executeQuery(params.query);

      const resultText = JSON.stringify(
        {
          query: params.query,
          rowCount: result.rowCount,
          executionTime: `${result.executionTime}ms`,
          data: result.data,
        },
        null,
        2
      );

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClickHouseMCPError
          ? `ClickHouse Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage, query: params.query }, null, 2),
          },
        ],
      };
    }
  }

  async listTables(database?: string): Promise<McpToolResult> {
    try {
      const tables = await this.db.listTables(database);

      const resultText = JSON.stringify(
        {
          tableCount: tables.length,
          database: database || "default",
          tables: tables.map((table) => ({
            name: table.name,
            engine: table.engine,
            totalRows: table.total_rows,
            totalBytes: table.total_bytes,
          })),
        },
        null,
        2
      );

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClickHouseMCPError
          ? `ClickHouse Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
      };
    }
  }

  async describeTable(params: DescribeTableParams): Promise<McpToolResult> {
    try {
      const columns = await this.db.describeTable(
        params.tableName,
        params.database
      );

      const resultText = JSON.stringify(
        {
          tableName: params.tableName,
          database: params.database || "default",
          columnCount: columns.length,
          columns: columns.map((column) => ({
            name: column.name,
            type: column.type,
            defaultKind: column.default_kind,
            defaultExpression: column.default_expression,
            isPrimaryKey: column.is_in_primary_key === 1,
            isSortingKey: column.is_in_sorting_key === 1,
          })),
        },
        null,
        2
      );

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClickHouseMCPError
          ? `ClickHouse Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: errorMessage, tableName: params.tableName },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async listDatabases(): Promise<McpToolResult> {
    try {
      const databases = await this.db.listDatabases();

      const resultText = JSON.stringify(
        {
          databaseCount: databases.length,
          databases: databases.map((db) => ({
            name: db.name,
            engine: db.engine,
          })),
        },
        null,
        2
      );

      return {
        content: [{ type: "text", text: resultText }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClickHouseMCPError
          ? `ClickHouse Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }, null, 2),
          },
        ],
      };
    }
  }
}
