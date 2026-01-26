import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgreSQLConnection } from "./database.js";
import { PostgreSQLMCPError } from "./types.js";
import pg from "pg";

vi.mock("pg", () => ({
  default: {
    Client: vi.fn(),
  },
}));

describe("PostgreSQLConnection", () => {
  let connection: PostgreSQLConnection;
  let mockClient: {
    connect: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };
    (pg.Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockClient
    );

    connection = new PostgreSQLConnection({
      host: "localhost",
      port: 5432,
      user: "testuser",
      password: "testpass",
      database: "testdb",
    });
  });

  describe("connect", () => {
    it("should successfully connect to PostgreSQL", async () => {
      await expect(connection.connect()).resolves.toBeUndefined();
      expect(pg.Client).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost",
          port: 5432,
          user: "testuser",
          password: "testpass",
          database: "testdb",
        })
      );
      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it("should throw PostgreSQLMCPError on connection failure", async () => {
      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      await expect(connection.connect()).rejects.toThrow(PostgreSQLMCPError);
      await expect(connection.connect()).rejects.toThrow(
        "Failed to connect to PostgreSQL"
      );
    });

    it("should use SSL when configured", async () => {
      const sslConnection = new PostgreSQLConnection({
        host: "localhost",
        port: 5432,
        user: "testuser",
        password: "testpass",
        database: "testdb",
        ssl: true,
      });

      await sslConnection.connect();

      expect(pg.Client).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        })
      );
    });
  });

  describe("executeQuery", () => {
    it("should execute SELECT query successfully", async () => {
      const mockRows = [
        { id: 1, name: "John" },
        { id: 2, name: "Jane" },
      ];
      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await connection.executeQuery("SELECT * FROM users");

      expect(result.data).toEqual(mockRows);
      expect(result.rowCount).toBe(2);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockClient.end).toHaveBeenCalled();
    });

    it("should allow EXPLAIN queries", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(
        connection.executeQuery("EXPLAIN SELECT * FROM users")
      ).resolves.toBeDefined();
    });

    it("should allow WITH (CTE) queries", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(
        connection.executeQuery("WITH cte AS (SELECT 1) SELECT * FROM cte")
      ).resolves.toBeDefined();
    });

    it("should reject INSERT queries", async () => {
      await expect(
        connection.executeQuery("INSERT INTO users VALUES (1, 'Test')")
      ).rejects.toThrow(PostgreSQLMCPError);
      await expect(
        connection.executeQuery("INSERT INTO users VALUES (1, 'Test')")
      ).rejects.toThrow("Only read-only queries are allowed");
    });

    it("should reject UPDATE queries", async () => {
      await expect(
        connection.executeQuery("UPDATE users SET name='Test' WHERE id=1")
      ).rejects.toThrow(PostgreSQLMCPError);
    });

    it("should reject DELETE queries", async () => {
      await expect(
        connection.executeQuery("DELETE FROM users WHERE id=1")
      ).rejects.toThrow(PostgreSQLMCPError);
    });

    it("should reject DROP queries", async () => {
      await expect(
        connection.executeQuery("DROP TABLE users")
      ).rejects.toThrow(PostgreSQLMCPError);
    });

    it("should reject CREATE queries", async () => {
      await expect(
        connection.executeQuery("CREATE TABLE test (id INT)")
      ).rejects.toThrow(PostgreSQLMCPError);
    });

    it("should throw PostgreSQLMCPError on query execution failure", async () => {
      const mockError = {
        message: "Syntax error",
        code: "42601",
        detail: "Some detail",
      };
      mockClient.query.mockRejectedValue(mockError);

      await expect(
        connection.executeQuery("SELECT * FROM invalid")
      ).rejects.toThrow(PostgreSQLMCPError);
    });

    it("should close connection even if query fails", async () => {
      mockClient.query.mockRejectedValue(new Error("Query failed"));

      try {
        await connection.executeQuery("SELECT * FROM users");
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe("listTables", () => {
    it("should list all tables in schema", async () => {
      const mockTables = [
        {
          table_name: "users",
          table_type: "BASE TABLE",
          table_schema: "public",
        },
        {
          table_name: "posts",
          table_type: "BASE TABLE",
          table_schema: "public",
        },
      ];
      mockClient.query.mockResolvedValue({ rows: mockTables });

      const result = await connection.listTables();

      expect(result).toHaveLength(2);
      expect(result[0].table_name).toBe("users");
      expect(result[1].table_name).toBe("posts");
    });

    it("should return empty array when no tables exist", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await connection.listTables();

      expect(result).toEqual([]);
    });

    it("should list tables from custom schema", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await connection.listTables("custom_schema");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("custom_schema")
      );
    });
  });

  describe("describeTable", () => {
    it("should describe table structure", async () => {
      const mockColumns = [
        {
          column_name: "id",
          data_type: "integer",
          is_nullable: "NO",
          column_default: "nextval('users_id_seq'::regclass)",
          constraint_type: "PRIMARY KEY",
          character_maximum_length: null,
        },
        {
          column_name: "name",
          data_type: "character varying",
          is_nullable: "YES",
          column_default: null,
          constraint_type: null,
          character_maximum_length: 255,
        },
      ];
      mockClient.query.mockResolvedValue({ rows: mockColumns });

      const result = await connection.describeTable("users");

      expect(result).toHaveLength(2);
      expect(result[0].column_name).toBe("id");
      expect(result[0].constraint_type).toBe("PRIMARY KEY");
      expect(result[1].column_name).toBe("name");
    });
  });

  describe("listDatabases", () => {
    it("should list all databases", async () => {
      const mockDatabases = [{ datname: "testdb" }, { datname: "production" }];
      mockClient.query.mockResolvedValue({ rows: mockDatabases });

      const result = await connection.listDatabases();

      expect(result).toHaveLength(2);
      expect(result[0].datname).toBe("testdb");
      expect(result[1].datname).toBe("production");
    });
  });

  describe("listSchemas", () => {
    it("should list all schemas", async () => {
      const mockSchemas = [
        { schema_name: "public" },
        { schema_name: "custom" },
      ];
      mockClient.query.mockResolvedValue({ rows: mockSchemas });

      const result = await connection.listSchemas();

      expect(result).toHaveLength(2);
      expect(result[0].schema_name).toBe("public");
      expect(result[1].schema_name).toBe("custom");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection test", async () => {
      mockClient.query.mockResolvedValue({ rows: [{ test: 1 }] });

      const result = await connection.testConnection();

      expect(result).toBe(true);
      expect(mockClient.end).toHaveBeenCalled();
    });

    it("should return false on connection test failure", async () => {
      mockClient.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await connection.testConnection();

      expect(result).toBe(false);
    });

    it("should close connection even if test fails", async () => {
      mockClient.query.mockRejectedValue(new Error("Test failed"));

      await connection.testConnection();

      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should be a no-op", async () => {
      await expect(connection.disconnect()).resolves.toBeUndefined();
    });
  });
});
