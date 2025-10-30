import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySQLConnection } from "./database.js";
import { MySQLMCPError } from "./types.js";
import mysql from "mysql2/promise";

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(),
  },
}));

describe("MySQLConnection", () => {
  let connection: MySQLConnection;
  let mockConnection: {
    execute: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = {
      execute: vi.fn(),
      end: vi.fn(),
    };
    (mysql.createConnection as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockConnection
    );

    connection = new MySQLConnection({
      host: "localhost",
      port: 3306,
      user: "testuser",
      password: "testpass",
      database: "testdb",
    });
  });

  describe("connect", () => {
    it("should successfully connect to MySQL", async () => {
      await expect(connection.connect()).resolves.toBeUndefined();
      expect(mysql.createConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "localhost",
          port: 3306,
          user: "testuser",
          password: "testpass",
          database: "testdb",
        })
      );
      expect(mockConnection.end).toHaveBeenCalled();
    });

    it("should throw MySQLMCPError on connection failure", async () => {
      (mysql.createConnection as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection failed")
      );

      await expect(connection.connect()).rejects.toThrow(MySQLMCPError);
      await expect(connection.connect()).rejects.toThrow(
        "Failed to connect to MySQL"
      );
    });

    it("should use SSL when configured", async () => {
      const sslConnection = new MySQLConnection({
        host: "localhost",
        port: 3306,
        user: "testuser",
        password: "testpass",
        database: "testdb",
        ssl: true,
      });

      await sslConnection.connect();

      expect(mysql.createConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {},
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
      mockConnection.execute.mockResolvedValue([mockRows, []]);

      const result = await connection.executeQuery("SELECT * FROM users");

      expect(result.data).toEqual(mockRows);
      expect(result.rowCount).toBe(2);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockConnection.end).toHaveBeenCalled();
    });

    it("should allow SHOW queries", async () => {
      mockConnection.execute.mockResolvedValue([[], []]);

      await expect(
        connection.executeQuery("SHOW TABLES")
      ).resolves.toBeDefined();
    });

    it("should allow DESCRIBE queries", async () => {
      mockConnection.execute.mockResolvedValue([[], []]);

      await expect(
        connection.executeQuery("DESCRIBE users")
      ).resolves.toBeDefined();
    });

    it("should allow EXPLAIN queries", async () => {
      mockConnection.execute.mockResolvedValue([[], []]);

      await expect(
        connection.executeQuery("EXPLAIN SELECT * FROM users")
      ).resolves.toBeDefined();
    });

    it("should reject INSERT queries", async () => {
      await expect(
        connection.executeQuery("INSERT INTO users VALUES (1, 'Test')")
      ).rejects.toThrow(MySQLMCPError);
      await expect(
        connection.executeQuery("INSERT INTO users VALUES (1, 'Test')")
      ).rejects.toThrow("Only read-only queries are allowed");
    });

    it("should reject UPDATE queries", async () => {
      await expect(
        connection.executeQuery("UPDATE users SET name='Test' WHERE id=1")
      ).rejects.toThrow(MySQLMCPError);
    });

    it("should reject DELETE queries", async () => {
      await expect(
        connection.executeQuery("DELETE FROM users WHERE id=1")
      ).rejects.toThrow(MySQLMCPError);
    });

    it("should reject DROP queries", async () => {
      await expect(connection.executeQuery("DROP TABLE users")).rejects.toThrow(
        MySQLMCPError
      );
    });

    it("should reject CREATE queries", async () => {
      await expect(
        connection.executeQuery("CREATE TABLE test (id INT)")
      ).rejects.toThrow(MySQLMCPError);
    });

    it("should throw MySQLMCPError on query execution failure", async () => {
      const mockError = {
        message: "Syntax error",
        code: "ER_PARSE_ERROR",
        sqlState: "42000",
      };
      mockConnection.execute.mockRejectedValue(mockError);

      await expect(
        connection.executeQuery("SELECT * FROM invalid")
      ).rejects.toThrow(MySQLMCPError);
    });

    it("should close connection even if query fails", async () => {
      mockConnection.execute.mockRejectedValue(new Error("Query failed"));

      try {
        await connection.executeQuery("SELECT * FROM users");
      } catch (error) {
        expect(error).toBeDefined();
      }

      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe("listTables", () => {
    it("should list all tables in database", async () => {
      const mockTables = [
        {
          TABLE_NAME: "users",
          TABLE_TYPE: "BASE TABLE",
          TABLE_SCHEMA: "testdb",
        },
        {
          TABLE_NAME: "posts",
          TABLE_TYPE: "BASE TABLE",
          TABLE_SCHEMA: "testdb",
        },
      ];
      mockConnection.execute.mockResolvedValue([mockTables, []]);

      const result = await connection.listTables();

      expect(result).toHaveLength(2);
      expect(result[0].TABLE_NAME).toBe("users");
      expect(result[1].TABLE_NAME).toBe("posts");
    });

    it("should return empty array when no tables exist", async () => {
      mockConnection.execute.mockResolvedValue([[], []]);

      const result = await connection.listTables();

      expect(result).toEqual([]);
    });
  });

  describe("describeTable", () => {
    it("should describe table structure", async () => {
      const mockColumns = [
        {
          COLUMN_NAME: "id",
          DATA_TYPE: "int",
          IS_NULLABLE: "NO",
          COLUMN_DEFAULT: null,
          COLUMN_KEY: "PRI",
          EXTRA: "auto_increment",
          COLUMN_COMMENT: "",
        },
        {
          COLUMN_NAME: "name",
          DATA_TYPE: "varchar",
          IS_NULLABLE: "YES",
          COLUMN_DEFAULT: null,
          COLUMN_KEY: "",
          EXTRA: "",
          COLUMN_COMMENT: "User name",
        },
      ];
      mockConnection.execute.mockResolvedValue([mockColumns, []]);

      const result = await connection.describeTable("users");

      expect(result).toHaveLength(2);
      expect(result[0].COLUMN_NAME).toBe("id");
      expect(result[0].COLUMN_KEY).toBe("PRI");
      expect(result[1].COLUMN_NAME).toBe("name");
    });
  });

  describe("showDatabases", () => {
    it("should list all databases", async () => {
      const mockDatabases = [
        { Database: "testdb" },
        { Database: "production" },
      ];
      mockConnection.execute.mockResolvedValue([mockDatabases, []]);

      const result = await connection.showDatabases();

      expect(result).toHaveLength(2);
      expect(result[0].Database).toBe("testdb");
      expect(result[1].Database).toBe("production");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection test", async () => {
      mockConnection.execute.mockResolvedValue([[{ test: 1 }], []]);

      const result = await connection.testConnection();

      expect(result).toBe(true);
      expect(mockConnection.end).toHaveBeenCalled();
    });

    it("should return false on connection test failure", async () => {
      (mysql.createConnection as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await connection.testConnection();

      expect(result).toBe(false);
    });

    it("should close connection even if test fails", async () => {
      mockConnection.execute.mockRejectedValue(new Error("Test failed"));

      await connection.testConnection();

      expect(mockConnection.end).toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("should be a no-op", async () => {
      await expect(connection.disconnect()).resolves.toBeUndefined();
    });
  });
});
