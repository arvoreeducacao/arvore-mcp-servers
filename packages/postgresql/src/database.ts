import pg from "pg";
import {
  PostgreSQLConfig,
  PostgreSQLConfigInput,
  PostgreSQLConfigSchema,
  QueryResult,
  TableInfo,
  ColumnInfo,
  DatabaseInfo,
  SchemaInfo,
  PostgreSQLMCPError,
} from "./types.js";

const { Client } = pg;

export class PostgreSQLConnection {
  private readonly config: PostgreSQLConfig;

  constructor(config: PostgreSQLConfigInput) {
    this.config = PostgreSQLConfigSchema.parse(config);
  }

  private async createClient(): Promise<pg.Client> {
    try {
      const client = new Client({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionTimeoutMillis: this.config.connectionTimeout,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      });

      await client.connect();
      return client;
    } catch (error) {
      throw new PostgreSQLMCPError(
        `Failed to connect to PostgreSQL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "CONNECTION_ERROR"
      );
    }
  }

  async connect(): Promise<void> {
    const client = await this.createClient();
    await client.end();
  }

  async disconnect(): Promise<void> {
  }

  private validateReadOnlyQuery(query: string): void {
    const trimmedQuery = query.trim().toLowerCase();
    const readOnlyPatterns = [
      /^select\s/,
      /^show\s/,
      /^explain\s/,
      /^with\s+\w+\s+as\s*\(/,
    ];

    const isReadOnly = readOnlyPatterns.some((pattern) =>
      pattern.test(trimmedQuery)
    );

    if (!isReadOnly) {
      throw new PostgreSQLMCPError(
        "Only read-only queries are allowed (SELECT, SHOW, EXPLAIN, WITH...AS)",
        "WRITE_OPERATION_NOT_ALLOWED"
      );
    }
  }

  async executeQuery(query: string): Promise<QueryResult> {
    this.validateReadOnlyQuery(query);

    const startTime = Date.now();
    let client: pg.Client | null = null;

    try {
      client = await this.createClient();
      const result = await client.query(query);
      const executionTime = Date.now() - startTime;

      const data = Array.isArray(result.rows)
        ? (result.rows as Record<string, unknown>[])
        : [];

      return {
        data,
        rowCount: data.length,
        executionTime,
      };
    } catch (error) {
      const pgError = error as pg.DatabaseError;
      throw new PostgreSQLMCPError(
        `Query execution failed: ${pgError.message}`,
        pgError.code,
        pgError.detail
      );
    } finally {
      if (client) {
        await client.end();
      }
    }
  }

  async listTables(schemaName: string = "public"): Promise<TableInfo[]> {
    const result = await this.executeQuery(`
      SELECT 
        table_name,
        table_type,
        table_schema
      FROM information_schema.tables 
      WHERE table_schema = '${schemaName}'
      ORDER BY table_name
    `);

    return result.data as unknown as TableInfo[];
  }

  async describeTable(
    tableName: string,
    schemaName: string = "public"
  ): Promise<ColumnInfo[]> {
    const result = await this.executeQuery(`
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        tc.constraint_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu 
        ON c.table_schema = kcu.table_schema 
        AND c.table_name = kcu.table_name 
        AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc 
        ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema = tc.table_schema
      WHERE c.table_schema = '${schemaName}' 
        AND c.table_name = '${tableName}'
      ORDER BY c.ordinal_position
    `);

    return result.data as unknown as ColumnInfo[];
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.executeQuery(`
      SELECT datname 
      FROM pg_database 
      WHERE datistemplate = false
      ORDER BY datname
    `);
    return result.data as unknown as DatabaseInfo[];
  }

  async listSchemas(): Promise<SchemaInfo[]> {
    const result = await this.executeQuery(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    return result.data as unknown as SchemaInfo[];
  }

  async testConnection(): Promise<boolean> {
    let client: pg.Client | null = null;
    try {
      client = await this.createClient();
      await client.query("SELECT 1 as test");
      return true;
    } catch {
      return false;
    } finally {
      if (client) {
        await client.end();
      }
    }
  }
}
