import mysql from "mysql2/promise";
import {
  MySQLConfig,
  QueryResult,
  TableInfo,
  ColumnInfo,
  DatabaseInfo,
  MySQLMCPError,
} from "./types.js";

export class MySQLConnection {
  constructor(private readonly config: MySQLConfig) {}

  private async createConnection(): Promise<mysql.Connection> {
    try {
      const connectionOptions: mysql.ConnectionOptions = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectTimeout: this.config.connectionTimeout,
      };

      if (this.config.ssl) {
        connectionOptions.ssl = {};
      }

      return await mysql.createConnection(connectionOptions);
    } catch (error) {
      throw new MySQLMCPError(
        `Failed to connect to MySQL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "CONNECTION_ERROR"
      );
    }
  }

  async connect(): Promise<void> {
    const connection = await this.createConnection();
    await connection.end();
  }

  async disconnect(): Promise<void> {
    // No-op: connections are managed per-query
  }

  private validateReadOnlyQuery(query: string): void {
    const trimmedQuery = query.trim().toLowerCase();
    const readOnlyPatterns = [
      /^select\s/,
      /^show\s/,
      /^describe\s/,
      /^desc\s/,
      /^explain\s/,
    ];

    const isReadOnly = readOnlyPatterns.some((pattern) =>
      pattern.test(trimmedQuery)
    );

    if (!isReadOnly) {
      throw new MySQLMCPError(
        "Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN)",
        "WRITE_OPERATION_NOT_ALLOWED"
      );
    }
  }

  async executeQuery(query: string): Promise<QueryResult> {
    this.validateReadOnlyQuery(query);

    const startTime = Date.now();
    let connection: mysql.Connection | null = null;

    try {
      connection = await this.createConnection();
      const [rows] = await connection.execute(query);
      const executionTime = Date.now() - startTime;

      const data = Array.isArray(rows)
        ? (rows as Record<string, unknown>[])
        : [];

      return {
        data,
        rowCount: data.length,
        executionTime,
      };
    } catch (error) {
      const mysqlError = error as mysql.QueryError;
      throw new MySQLMCPError(
        `Query execution failed: ${mysqlError.message}`,
        mysqlError.code,
        mysqlError.sqlState
      );
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async listTables(): Promise<TableInfo[]> {
    const result = await this.executeQuery(`
      SELECT 
        TABLE_NAME,
        TABLE_TYPE,
        TABLE_SCHEMA
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${this.config.database}'
      ORDER BY TABLE_NAME
    `);

    return result.data as unknown as TableInfo[];
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.executeQuery(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_KEY,
        EXTRA,
        COLUMN_COMMENT
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = '${this.config.database}' 
        AND TABLE_NAME = '${tableName}'
      ORDER BY ORDINAL_POSITION
    `);

    return result.data as unknown as ColumnInfo[];
  }

  async showDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery("SHOW DATABASES");
    return result.data as unknown as DatabaseInfo[];
  }

  async testConnection(): Promise<boolean> {
    let connection: mysql.Connection | null = null;
    try {
      connection = await this.createConnection();
      await connection.execute("SELECT 1 as test");
      return true;
    } catch {
      return false;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}
