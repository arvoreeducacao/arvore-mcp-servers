import { createClient, ClickHouseClient } from "@clickhouse/client";
import {
  ClickHouseConfig,
  ClickHouseConfigInput,
  ClickHouseConfigSchema,
  QueryResult,
  TableInfo,
  ColumnInfo,
  DatabaseInfo,
  ClickHouseMCPError,
} from "./types.js";

export class ClickHouseConnection {
  private readonly config: ClickHouseConfig;
  private client: ClickHouseClient | null = null;

  constructor(config: ClickHouseConfigInput) {
    this.config = ClickHouseConfigSchema.parse(config);
  }

  async connect(): Promise<void> {
    try {
      this.client = createClient({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        request_timeout: this.config.requestTimeout,
      });
    } catch (error) {
      throw new ClickHouseMCPError(
        `Failed to create ClickHouse client: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "CONNECTION_ERROR"
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  private getClient(): ClickHouseClient {
    if (!this.client) {
      throw new ClickHouseMCPError(
        "ClickHouse client not initialized. Call connect() first.",
        "CLIENT_NOT_INITIALIZED"
      );
    }
    return this.client;
  }

  private validateReadOnlyQuery(query: string): void {
    const trimmedQuery = query.trim().toLowerCase();
    const readOnlyPatterns = [
      /^select\s/,
      /^show\s/,
      /^describe\s/,
      /^desc\s/,
      /^explain\s/,
      /^with\s+\w+\s+as\s*\(/,
      /^exists\s/,
    ];

    const isReadOnly = readOnlyPatterns.some((pattern) =>
      pattern.test(trimmedQuery)
    );

    if (!isReadOnly) {
      throw new ClickHouseMCPError(
        "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH...AS, EXISTS)",
        "WRITE_OPERATION_NOT_ALLOWED"
      );
    }
  }

  async executeQuery(query: string): Promise<QueryResult> {
    this.validateReadOnlyQuery(query);

    const startTime = Date.now();

    try {
      const client = this.getClient();
      const resultSet = await client.query({
        query,
        format: "JSONEachRow",
      });

      const data = await resultSet.json<Record<string, unknown>>();
      const executionTime = Date.now() - startTime;

      return {
        data,
        rowCount: data.length,
        executionTime,
      };
    } catch (error) {
      if (error instanceof ClickHouseMCPError) throw error;
      throw new ClickHouseMCPError(
        `Query execution failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "QUERY_ERROR"
      );
    }
  }

  async listTables(database?: string): Promise<TableInfo[]> {
    const db = database || this.config.database;
    const result = await this.executeQuery(`
      SELECT
        name,
        engine,
        toString(total_rows) as total_rows,
        toString(total_bytes) as total_bytes
      FROM system.tables
      WHERE database = '${db}'
      ORDER BY name
    `);

    return result.data as unknown as TableInfo[];
  }

  async describeTable(
    tableName: string,
    database?: string
  ): Promise<ColumnInfo[]> {
    const db = database || this.config.database;
    const result = await this.executeQuery(`
      SELECT
        name,
        type,
        default_kind,
        default_expression,
        is_in_primary_key,
        is_in_sorting_key
      FROM system.columns
      WHERE database = '${db}'
        AND table = '${tableName}'
      ORDER BY position
    `);

    return result.data as unknown as ColumnInfo[];
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery(`
      SELECT name, engine
      FROM system.databases
      ORDER BY name
    `);
    return result.data as unknown as DatabaseInfo[];
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = this.getClient();
      const result = await client.query({
        query: "SELECT 1 as test",
        format: "JSONEachRow",
      });
      await result.json();
      return true;
    } catch {
      return false;
    }
  }
}
