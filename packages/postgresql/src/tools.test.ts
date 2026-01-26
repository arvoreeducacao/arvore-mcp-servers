import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgreSQLMCPTools } from "./tools.js";
import { PostgreSQLConnection } from "./database.js";
import { PostgreSQLMCPError } from "./types.js";

vi.mock("./database.js", () => ({
  PostgreSQLConnection: vi.fn(),
}));

describe("PostgreSQLMCPTools", () => {
  let tools: PostgreSQLMCPTools;
  let mockDb: {
    executeQuery: ReturnType<typeof vi.fn>;
    listTables: ReturnType<typeof vi.fn>;
    describeTable: ReturnType<typeof vi.fn>;
    listDatabases: ReturnType<typeof vi.fn>;
    listSchemas: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      executeQuery: vi.fn(),
      listTables: vi.fn(),
      describeTable: vi.fn(),
      listDatabases: vi.fn(),
      listSchemas: vi.fn(),
    };
    tools = new PostgreSQLMCPTools(mockDb as unknown as PostgreSQLConnection);
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
        new PostgreSQLMCPError("Syntax error", "42601", "Some detail")
      );

      const result = await tools.readQuery({ query: "SELECT * FROM invalid" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("PostgreSQL Error");
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
          table_name: "users",
          table_type: "BASE TABLE",
          table_schema: "public",
        },
        {
          table_name: "posts",
          table_type: "BASE TABLE",
          table_schema: "public",
        },
        { table_name: "user_view", table_type: "VIEW", table_schema: "public" },
      ]);

      const result = await tools.listTables();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tableCount).toBe(3);
      expect(parsed.schema).toBe("public");
      expect(parsed.tables).toHaveLength(3);
      expect(parsed.tables[0].name).toBe("users");
      expect(parsed.tables[0].type).toBe("BASE TABLE");
      expect(parsed.tables[0].schema).toBe("public");
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
        new PostgreSQLMCPError("Access denied", "42501")
      );

      const result = await tools.listTables();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("PostgreSQL Error");
    });

    it("should list tables from custom schema", async () => {
      mockDb.listTables.mockResolvedValue([
        {
          table_name: "custom_table",
          table_type: "BASE TABLE",
          table_schema: "custom",
        },
      ]);

      const result = await tools.listTables("custom");

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.schema).toBe("custom");
      expect(mockDb.listTables).toHaveBeenCalledWith("custom");
    });
  });

  describe("describeTable", () => {
    it("should return table structure", async () => {
      mockDb.describeTable.mockResolvedValue([
        {
          column_name: "id",
          data_type: "integer",
          is_nullable: "NO",
          column_default: "nextval('users_id_seq'::regclass)",
          constraint_type: "PRIMARY KEY",
          character_maximum_length: null,
        },
        {
          column_name: "email",
          data_type: "character varying",
          is_nullable: "NO",
          column_default: null,
          constraint_type: "UNIQUE",
          character_maximum_length: 255,
        },
        {
          column_name: "created_at",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
          column_default: "CURRENT_TIMESTAMP",
          constraint_type: null,
          character_maximum_length: null,
        },
      ]);

      const result = await tools.describeTable({
        tableName: "users",
        schemaName: "public",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tableName).toBe("users");
      expect(parsed.schema).toBe("public");
      expect(parsed.columnCount).toBe(3);
      expect(parsed.columns).toHaveLength(3);
      expect(parsed.columns[0].name).toBe("id");
      expect(parsed.columns[0].type).toBe("integer");
      expect(parsed.columns[0].nullable).toBe(false);
      expect(parsed.columns[0].constraint).toBe("PRIMARY KEY");
      expect(parsed.columns[1].nullable).toBe(false);
      expect(parsed.columns[1].maxLength).toBe(255);
      expect(parsed.columns[2].nullable).toBe(true);
    });

    it("should return error result when table not found", async () => {
      mockDb.describeTable.mockRejectedValue(
        new PostgreSQLMCPError("Table doesn't exist", "42P01")
      );

      const result = await tools.describeTable({
        tableName: "non_existent",
        schemaName: "public",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("PostgreSQL Error");
      expect(parsed.tableName).toBe("non_existent");
    });
  });

  describe("listDatabases", () => {
    it("should return list of databases", async () => {
      mockDb.listDatabases.mockResolvedValue([
        { datname: "postgres" },
        { datname: "testdb" },
        { datname: "production" },
      ]);

      const result = await tools.listDatabases();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.databaseCount).toBe(3);
      expect(parsed.databases).toEqual(["postgres", "testdb", "production"]);
    });

    it("should return error result when listing databases fails", async () => {
      mockDb.listDatabases.mockRejectedValue(
        new PostgreSQLMCPError("Access denied", "42501")
      );

      const result = await tools.listDatabases();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("PostgreSQL Error");
    });
  });

  describe("listSchemas", () => {
    it("should return list of schemas", async () => {
      mockDb.listSchemas.mockResolvedValue([
        { schema_name: "public" },
        { schema_name: "custom" },
        { schema_name: "analytics" },
      ]);

      const result = await tools.listSchemas();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.schemaCount).toBe(3);
      expect(parsed.schemas).toEqual(["public", "custom", "analytics"]);
    });

    it("should return error result when listing schemas fails", async () => {
      mockDb.listSchemas.mockRejectedValue(
        new PostgreSQLMCPError("Access denied", "42501")
      );

      const result = await tools.listSchemas();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("PostgreSQL Error");
    });
  });
});
