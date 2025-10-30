import { describe, it, expect, vi, beforeEach } from "vitest";
import { MySQLMCPTools } from "./tools.js";
import { MySQLConnection } from "./database.js";
import { MySQLMCPError } from "./types.js";

vi.mock("./database.js", () => ({
  MySQLConnection: vi.fn(),
}));

describe("MySQLMCPTools", () => {
  let tools: MySQLMCPTools;
  let mockDb: {
    executeQuery: ReturnType<typeof vi.fn>;
    listTables: ReturnType<typeof vi.fn>;
    describeTable: ReturnType<typeof vi.fn>;
    showDatabases: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      executeQuery: vi.fn(),
      listTables: vi.fn(),
      describeTable: vi.fn(),
      showDatabases: vi.fn(),
    };
    tools = new MySQLMCPTools(mockDb as unknown as MySQLConnection);
  });

  describe("readQuery", () => {
    it("should execute query and return formatted result", async () => {
      mockDb.executeQuery.mockResolvedValue({
        data: [
          { id: 1, name: "John" },
          { id: 2, name: "Jane" },
        ],
        rowCount: 2,
        executionTime: 15,
      });

      const result = await tools.readQuery({ query: "SELECT * FROM users" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.query).toBe("SELECT * FROM users");
      expect(parsed.rowCount).toBe(2);
      expect(parsed.executionTime).toBe("15ms");
      expect(parsed.data).toHaveLength(2);
    });

    it("should return error result when query fails", async () => {
      mockDb.executeQuery.mockRejectedValue(
        new MySQLMCPError("Syntax error", "ER_PARSE_ERROR", "42000")
      );

      const result = await tools.readQuery({ query: "SELECT * FROM invalid" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("MySQL Error");
      expect(parsed.query).toBe("SELECT * FROM invalid");
    });

    it("should handle unexpected errors", async () => {
      mockDb.executeQuery.mockRejectedValue(new Error("Unexpected error"));

      const result = await tools.readQuery({ query: "SELECT * FROM users" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Unexpected error");
    });

    it("should handle empty result sets", async () => {
      mockDb.executeQuery.mockResolvedValue({
        data: [],
        rowCount: 0,
        executionTime: 5,
      });

      const result = await tools.readQuery({
        query: "SELECT * FROM empty_table",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.rowCount).toBe(0);
      expect(parsed.data).toEqual([]);
    });
  });

  describe("listTables", () => {
    it("should return list of tables", async () => {
      mockDb.listTables.mockResolvedValue([
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
        { TABLE_NAME: "user_view", TABLE_TYPE: "VIEW", TABLE_SCHEMA: "testdb" },
      ]);

      const result = await tools.listTables();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tableCount).toBe(3);
      expect(parsed.tables).toHaveLength(3);
      expect(parsed.tables[0].name).toBe("users");
      expect(parsed.tables[0].type).toBe("BASE TABLE");
      expect(parsed.tables[0].schema).toBe("testdb");
    });

    it("should handle empty table list", async () => {
      mockDb.listTables.mockResolvedValue([]);

      const result = await tools.listTables();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tableCount).toBe(0);
      expect(parsed.tables).toEqual([]);
    });

    it("should return error result when listing fails", async () => {
      mockDb.listTables.mockRejectedValue(
        new MySQLMCPError("Access denied", "ER_ACCESS_DENIED")
      );

      const result = await tools.listTables();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("MySQL Error");
    });
  });

  describe("describeTable", () => {
    it("should return table structure", async () => {
      mockDb.describeTable.mockResolvedValue([
        {
          COLUMN_NAME: "id",
          DATA_TYPE: "int",
          IS_NULLABLE: "NO",
          COLUMN_DEFAULT: null,
          COLUMN_KEY: "PRI",
          EXTRA: "auto_increment",
          COLUMN_COMMENT: "Primary key",
        },
        {
          COLUMN_NAME: "email",
          DATA_TYPE: "varchar",
          IS_NULLABLE: "NO",
          COLUMN_DEFAULT: null,
          COLUMN_KEY: "UNI",
          EXTRA: "",
          COLUMN_COMMENT: "User email",
        },
        {
          COLUMN_NAME: "created_at",
          DATA_TYPE: "timestamp",
          IS_NULLABLE: "YES",
          COLUMN_DEFAULT: "CURRENT_TIMESTAMP",
          COLUMN_KEY: "",
          EXTRA: "DEFAULT_GENERATED",
          COLUMN_COMMENT: "",
        },
      ]);

      const result = await tools.describeTable({ tableName: "users" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tableName).toBe("users");
      expect(parsed.columnCount).toBe(3);
      expect(parsed.columns).toHaveLength(3);
      expect(parsed.columns[0].name).toBe("id");
      expect(parsed.columns[0].type).toBe("int");
      expect(parsed.columns[0].nullable).toBe(false);
      expect(parsed.columns[0].key).toBe("PRI");
      expect(parsed.columns[1].nullable).toBe(false);
      expect(parsed.columns[2].nullable).toBe(true);
    });

    it("should return error result when table not found", async () => {
      mockDb.describeTable.mockRejectedValue(
        new MySQLMCPError("Table doesn't exist", "ER_NO_SUCH_TABLE")
      );

      const result = await tools.describeTable({ tableName: "non_existent" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("MySQL Error");
      expect(parsed.tableName).toBe("non_existent");
    });
  });

  describe("showDatabases", () => {
    it("should return list of databases", async () => {
      mockDb.showDatabases.mockResolvedValue([
        { Database: "information_schema" },
        { Database: "testdb" },
        { Database: "production" },
      ]);

      const result = await tools.showDatabases();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.databaseCount).toBe(3);
      expect(parsed.databases).toEqual([
        "information_schema",
        "testdb",
        "production",
      ]);
    });

    it("should return error result when listing databases fails", async () => {
      mockDb.showDatabases.mockRejectedValue(
        new MySQLMCPError("Access denied", "ER_ACCESS_DENIED")
      );

      const result = await tools.showDatabases();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("MySQL Error");
    });
  });
});
