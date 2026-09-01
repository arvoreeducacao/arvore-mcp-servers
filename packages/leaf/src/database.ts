import mysql from "mysql2/promise";
import {
  LeafConfig,
  LeafConfigInput,
  LeafConfigSchema,
  LeafMCPError,
} from "./types.js";

export interface QueryRunner {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>
  ): Promise<Array<T>>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export class LeafConnection implements QueryRunner {
  private readonly config: LeafConfig;
  private pool: mysql.Pool | null = null;

  constructor(config: LeafConfigInput) {
    this.config = LeafConfigSchema.parse(config);
  }

  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      this.pool = mysql.createPool({
        uri: this.config.databaseUrl,
        connectionLimit: 3,
        connectTimeout: this.config.connectionTimeout,
      });

      await this.query("SELECT 1");
    } catch (error) {
      this.pool = null;
      throw new LeafMCPError(
        `Failed to connect to the Leaf database: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "CONNECTION_ERROR"
      );
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: ReadonlyArray<unknown> = []
  ): Promise<Array<T>> {
    if (!this.pool) {
      throw new LeafMCPError("Not connected", "NOT_CONNECTED");
    }

    try {
      const [rows] = await this.pool.query(sql, params as unknown[]);

      return rows as Array<T>;
    } catch (error) {
      throw new LeafMCPError(
        `Query failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "QUERY_ERROR"
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) {
      return;
    }

    const pool = this.pool;

    this.pool = null;
    await pool.end();
  }
}
