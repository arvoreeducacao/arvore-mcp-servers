import mysql from "mysql2/promise";

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export class Database implements Queryable {
  private pool: mysql.Pool;

  constructor(config: DatabaseConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectionLimit: 4,
      connectTimeout: 10_000,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
    this.pool.on("connection", (connection) => {
      connection.query("SET SESSION TRANSACTION READ ONLY");
    });
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
