import { describe, it, expect } from "vitest";
import { parseDDL, extractInlineForeignKeys } from "./parser.js";
import {
  generateErd,
  generateDomainMap,
  explainTable,
  traceFlow,
} from "./mermaid.js";

const sampleDDL = `
CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  PRIMARY KEY (id),
  UNIQUE KEY (email)
);

CREATE TABLE posts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE comments (
  id INT NOT NULL AUTO_INCREMENT,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;

function getSchema() {
  let schema = parseDDL(sampleDDL);
  schema = extractInlineForeignKeys(sampleDDL, schema);
  return schema;
}

describe("generateErd", () => {
  it("generates valid mermaid erDiagram", () => {
    const schema = getSchema();
    const diagram = generateErd(schema);
    expect(diagram).toContain("erDiagram");
    expect(diagram).toContain("users {");
    expect(diagram).toContain("posts {");
    expect(diagram).toContain("comments {");
  });

  it("includes relationship lines", () => {
    const schema = getSchema();
    const diagram = generateErd(schema);
    expect(diagram).toContain("users");
    expect(diagram).toContain("posts");
  });

  it("filters to specific tables", () => {
    const schema = getSchema();
    const diagram = generateErd(schema, { tables: ["users", "posts"] });
    expect(diagram).toContain("users {");
    expect(diagram).toContain("posts {");
    expect(diagram).not.toContain("comments {");
  });

  it("adds title when provided", () => {
    const schema = getSchema();
    const diagram = generateErd(schema, { title: "My ERD" });
    expect(diagram).toContain("title: My ERD");
  });
});

describe("generateDomainMap", () => {
  it("traverses from entry table", () => {
    const schema = getSchema();
    const diagram = generateDomainMap(schema, "posts", 1);
    expect(diagram).toContain("posts {");
    expect(diagram).toContain("users {");
    expect(diagram).toContain("comments {");
  });

  it("respects depth limit", () => {
    const schema = getSchema();
    const diagram = generateDomainMap(schema, "comments", 0);
    expect(diagram).toContain("comments {");
  });
});

describe("explainTable", () => {
  it("shows column details", () => {
    const schema = getSchema();
    const explanation = explainTable(schema, "posts");
    expect(explanation).toContain("# posts");
    expect(explanation).toContain("user_id");
    expect(explanation).toContain("## Foreign Keys");
    expect(explanation).toContain("users");
  });

  it("shows incoming references", () => {
    const schema = getSchema();
    const explanation = explainTable(schema, "users");
    expect(explanation).toContain("## Referenced By");
    expect(explanation).toContain("posts");
    expect(explanation).toContain("comments");
  });

  it("returns error for unknown table", () => {
    const schema = getSchema();
    const explanation = explainTable(schema, "nonexistent");
    expect(explanation).toContain("not found");
  });
});

describe("traceFlow", () => {
  it("finds path between tables", () => {
    const schema = getSchema();
    const flow = traceFlow(schema, "comments", "users");
    expect(flow).toContain("# Flow:");
    expect(flow).toContain("comments");
    expect(flow).toContain("users");
  });

  it("returns message when no path exists", () => {
    const ddl = `
CREATE TABLE a (id INT PRIMARY KEY);
CREATE TABLE b (id INT PRIMARY KEY);
`;
    const schema = parseDDL(ddl);
    const flow = traceFlow(schema, "a", "b");
    expect(flow).toContain("No relationship path found");
  });
});
