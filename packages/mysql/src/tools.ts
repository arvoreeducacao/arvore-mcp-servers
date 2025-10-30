import { MySQLConnection } from "./database.js";
import {
  ReadQueryParams,
  DescribeTableParams,
  McpToolResult,
  MySQLMCPError,
} from "./types.js";

export class MySQLMCPTools {
  constructor(private db: MySQLConnection) {}

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
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof MySQLMCPError
          ? `MySQL Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                query: params.query,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async listTables(): Promise<McpToolResult> {
    try {
      const tables = await this.db.listTables();

      const resultText = JSON.stringify(
        {
          tableCount: tables.length,
          tables: tables.map((table) => ({
            name: table.TABLE_NAME,
            type: table.TABLE_TYPE,
            schema: table.TABLE_SCHEMA,
          })),
        },
        null,
        2
      );

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof MySQLMCPError
          ? `MySQL Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async describeTable(params: DescribeTableParams): Promise<McpToolResult> {
    try {
      const columns = await this.db.describeTable(params.tableName);

      const resultText = JSON.stringify(
        {
          tableName: params.tableName,
          columnCount: columns.length,
          columns: columns.map((column) => ({
            name: column.COLUMN_NAME,
            type: column.DATA_TYPE,
            nullable: column.IS_NULLABLE === "YES",
            default: column.COLUMN_DEFAULT,
            key: column.COLUMN_KEY,
            extra: column.EXTRA,
            comment: column.COLUMN_COMMENT,
          })),
        },
        null,
        2
      );

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof MySQLMCPError
          ? `MySQL Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                tableName: params.tableName,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async showDatabases(): Promise<McpToolResult> {
    try {
      const databases = await this.db.showDatabases();

      const resultText = JSON.stringify(
        {
          databaseCount: databases.length,
          databases: databases.map((db) => db.Database),
        },
        null,
        2
      );

      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof MySQLMCPError
          ? `MySQL Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
}
