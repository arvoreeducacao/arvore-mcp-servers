import { PostgreSQLConnection } from "./database.js";
import {
  ReadQueryParams,
  DescribeTableParams,
  McpToolResult,
  PostgreSQLMCPError,
} from "./types.js";

export class PostgreSQLMCPTools {
  constructor(private db: PostgreSQLConnection) {}

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
        error instanceof PostgreSQLMCPError
          ? `PostgreSQL Error: ${error.message}`
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

  async listTables(schemaName: string = "public"): Promise<McpToolResult> {
    try {
      const tables = await this.db.listTables(schemaName);

      const resultText = JSON.stringify(
        {
          tableCount: tables.length,
          schema: schemaName,
          tables: tables.map((table) => ({
            name: table.table_name,
            type: table.table_type,
            schema: table.table_schema,
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
        error instanceof PostgreSQLMCPError
          ? `PostgreSQL Error: ${error.message}`
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
      const columns = await this.db.describeTable(
        params.tableName,
        params.schemaName
      );

      const resultText = JSON.stringify(
        {
          tableName: params.tableName,
          schema: params.schemaName,
          columnCount: columns.length,
          columns: columns.map((column) => ({
            name: column.column_name,
            type: column.data_type,
            nullable: column.is_nullable === "YES",
            default: column.column_default,
            constraint: column.constraint_type,
            maxLength: column.character_maximum_length,
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
        error instanceof PostgreSQLMCPError
          ? `PostgreSQL Error: ${error.message}`
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

  async listDatabases(): Promise<McpToolResult> {
    try {
      const databases = await this.db.listDatabases();

      const resultText = JSON.stringify(
        {
          databaseCount: databases.length,
          databases: databases.map((db) => db.datname),
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
        error instanceof PostgreSQLMCPError
          ? `PostgreSQL Error: ${error.message}`
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

  async listSchemas(): Promise<McpToolResult> {
    try {
      const schemas = await this.db.listSchemas();

      const resultText = JSON.stringify(
        {
          schemaCount: schemas.length,
          schemas: schemas.map((s) => s.schema_name),
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
        error instanceof PostgreSQLMCPError
          ? `PostgreSQL Error: ${error.message}`
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
