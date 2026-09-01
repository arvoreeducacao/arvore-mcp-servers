import { describe, expect, it } from "vitest";
import { QueryRunner } from "./database.js";
import { LeafMCPTools } from "./tools.js";

type Row = Record<string, unknown>;

function fakeDb(handler: (sql: string, params: ReadonlyArray<unknown>) => Row[]): QueryRunner {
  return {
    async query<T>(sql: string, params: ReadonlyArray<unknown> = []) {
      return handler(sql, params) as T[];
    },
    async connect() {},
    async disconnect() {},
  };
}

function payloadOf(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe("searchDocuments", () => {
  it("returns full-text hits", async () => {
    const tools = new LeafMCPTools(
      fakeDb((sql) =>
        sql.includes("MATCH")
          ? [{ id: "d1", title: "Plano", kind: "page", score: 1.2 }]
          : []
      )
    );

    const payload = payloadOf(
      await tools.searchDocuments({ query: "plano", limit: 10 })
    );

    expect(payload.resultCount).toBe(1);
    expect(payload.results[0].id).toBe("d1");
  });

  it("falls back to title LIKE when full-text has no hits", async () => {
    const calls: string[] = [];
    const tools = new LeafMCPTools(
      fakeDb((sql) => {
        calls.push(sql);

        return sql.includes("LIKE")
          ? [{ id: "d2", title: "Sem indice", kind: "page" }]
          : [];
      })
    );

    const payload = payloadOf(
      await tools.searchDocuments({ query: "indice", limit: 5 })
    );

    expect(calls).toHaveLength(2);
    expect(payload.results[0].id).toBe("d2");
  });

  it("reports query errors as tool payload", async () => {
    const tools = new LeafMCPTools(
      fakeDb(() => {
        throw new Error("boom");
      })
    );

    const payload = payloadOf(
      await tools.searchDocuments({ query: "x", limit: 5 })
    );

    expect(payload.error).toContain("boom");
  });
});

describe("getDocument", () => {
  it("renders content as markdown with children", async () => {
    const content = JSON.stringify([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Oi", styles: {} }] },
    ]);
    const tools = new LeafMCPTools(
      fakeDb((sql) =>
        sql.includes("parent_id = ?")
          ? [{ id: "c1", title: "Filha", kind: "page" }]
          : [
              {
                id: "d1",
                title: "Doc",
                kind: "page",
                content,
                properties: null,
                parent_id: null,
                org_access: "viewer",
                owner_email: "a@arvore.com.br",
                org_name: "Tech",
                teamspace_name: null,
              },
            ]
      )
    );

    const payload = payloadOf(await tools.getDocument({ documentId: "d1" }));

    expect(payload.markdown).toBe("# Oi");
    expect(payload.organization).toBe("Tech");
    expect(payload.children).toHaveLength(1);
    expect(payload.rowValues).toBeUndefined();
  });

  it("returns not found for missing documents", async () => {
    const tools = new LeafMCPTools(fakeDb(() => []));
    const payload = payloadOf(await tools.getDocument({ documentId: "nope" }));

    expect(payload.error).toContain("Document not found");
  });
});

describe("getDatabase", () => {
  const property = {
    id: "p1",
    name: "Status",
    type: "select",
    options: JSON.stringify([{ id: "o1", name: "Feito", color: "lime" }]),
    position: 0,
  };

  function db(kind: string) {
    return fakeDb((sql) => {
      if (sql.includes("database_properties")) {
        return [property];
      }
      if (sql.includes("database_views")) {
        return [{ name: "Tabela", type: "table", position: 0 }];
      }
      if (sql.includes("kind = 'row'")) {
        return [
          {
            id: "r1",
            title: "Linha",
            properties: JSON.stringify({ p1: "o1", ghost: "x" }),
          },
        ];
      }

      return [{ id: "db1", title: "Base", kind }];
    });
  }

  it("resolves property and option names on rows", async () => {
    const tools = new LeafMCPTools(db("database"));
    const payload = payloadOf(await tools.getDatabase({ databaseId: "db1" }));

    expect(payload.rowCount).toBe(1);
    expect(payload.rows[0].values).toEqual({ Status: "Feito" });
    expect(payload.views[0].type).toBe("table");
  });

  it("rejects documents that are not databases", async () => {
    const tools = new LeafMCPTools(db("page"));
    const payload = payloadOf(await tools.getDatabase({ databaseId: "db1" }));

    expect(payload.error).toContain("Database not found");
  });
});

describe("listComments", () => {
  it("groups replies under threads", async () => {
    const tools = new LeafMCPTools(
      fakeDb(() => [
        {
          id: "t1",
          parent_id: null,
          block_id: "b1",
          body: "Pergunta",
          resolved_at: null,
          author_email: "a@arvore.com.br",
          author_name: "Ana",
        },
        {
          id: "r1",
          parent_id: "t1",
          block_id: null,
          body: "Resposta",
          resolved_at: null,
          author_email: "b@arvore.com.br",
          author_name: null,
        },
      ])
    );

    const payload = payloadOf(await tools.listComments({ documentId: "d1" }));

    expect(payload.threadCount).toBe(1);
    expect(payload.threads[0].author).toBe("Ana");
    expect(payload.threads[0].replies[0].author).toBe("b@arvore.com.br");
    expect(payload.threads[0].resolved).toBe(false);
  });
});

describe("listDocuments", () => {
  it("applies filters in order", async () => {
    let captured: ReadonlyArray<unknown> = [];
    const tools = new LeafMCPTools(
      fakeDb((sql, params) => {
        captured = params;

        expect(sql).toContain("d.org_id = ?");
        expect(sql).toContain("u.email = ?");

        return [];
      })
    );

    await tools.listDocuments({
      orgId: "org1",
      ownerEmail: "a@arvore.com.br",
      limit: 50,
    });

    expect(captured).toEqual(["org1", "a@arvore.com.br", 50]);
  });
});
