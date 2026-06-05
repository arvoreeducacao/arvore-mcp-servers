import { describe, it, expect } from "vitest";
import { parseDDL, extractInlineForeignKeys } from "./parser.js";

const sampleDDL = `
CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY (email)
);

CREATE TABLE posts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  published_at TIMESTAMP,
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

CREATE TABLE tags (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL UNIQUE,
  PRIMARY KEY (id)
);

CREATE TABLE post_tags (
  post_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);
`;

describe("parseDDL", () => {
  it("parses all tables", () => {
    const schema = parseDDL(sampleDDL);
    expect(schema.tables).toHaveLength(5);
    expect(schema.tables.map((t) => t.name)).toEqual([
      "users",
      "posts",
      "comments",
      "tags",
      "post_tags",
    ]);
  });

  it("parses columns correctly", () => {
    const schema = parseDDL(sampleDDL);
    const users = schema.tables.find((t) => t.name === "users")!;
    expect(users.columns).toHaveLength(4);

    const idCol = users.columns.find((c) => c.name === "id")!;
    expect(idCol.primaryKey).toBe(true);
    expect(idCol.nullable).toBe(false);

    const emailCol = users.columns.find((c) => c.name === "email")!;
    expect(emailCol.nullable).toBe(false);
  });

  it("parses foreign keys", () => {
    const schema = parseDDL(sampleDDL);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    expect(posts.foreignKeys).toHaveLength(1);
    expect(posts.foreignKeys[0]).toEqual({
      columns: ["user_id"],
      referencedTable: "users",
      referencedColumns: ["id"],
    });
  });

  it("parses composite primary keys", () => {
    const schema = parseDDL(sampleDDL);
    const postTags = schema.tables.find((t) => t.name === "post_tags")!;
    const pkCols = postTags.columns.filter((c) => c.primaryKey);
    expect(pkCols.map((c) => c.name)).toEqual(["post_id", "tag_id"]);
  });

  it("parses multiple foreign keys on one table", () => {
    const schema = parseDDL(sampleDDL);
    const comments = schema.tables.find((t) => t.name === "comments")!;
    expect(comments.foreignKeys).toHaveLength(2);
  });

  it("handles PostgreSQL inline references", () => {
    const pgDDL = `
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  total DECIMAL(10,2)
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL
);
`;
    let schema = parseDDL(pgDDL);
    schema = extractInlineForeignKeys(pgDDL, schema);
    const orders = schema.tables.find((t) => t.name === "orders")!;
    expect(orders.foreignKeys).toHaveLength(1);
    expect(orders.foreignKeys[0].referencedTable).toBe("customers");
  });
});
