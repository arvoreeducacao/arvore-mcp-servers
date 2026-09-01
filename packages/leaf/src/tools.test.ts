import { describe, expect, it } from "vitest";
import { QueryRunner } from "./database.js";
import { LeafMCPTools } from "./tools.js";

type Row = Record<string, unknown>;

interface FakeDb extends QueryRunner {
  writes: Array<{ sql: string; params: ReadonlyArray<unknown> }>;
}

function fakeDb(
  handler: (sql: string, params: ReadonlyArray<unknown>) => Row[],
  affectedRows = 1
): FakeDb {
  const writes: FakeDb["writes"] = [];

  return {
    writes,
    async query<T>(sql: string, params: ReadonlyArray<unknown> = []) {
      return handler(sql, params) as T[];
    },
    async execute(sql: string, params: ReadonlyArray<unknown> = []) {
      writes.push({ sql, params });

      return affectedRows;
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

describe("createDocument", () => {
  it("creates a page with converted blocks and indexes it", async () => {
    const db = fakeDb((sql) =>
      sql.includes("FROM user") ? [{ id: "u1" }] : []
    );
    const tools = new LeafMCPTools(db, "https://leaf.test");

    const payload = payloadOf(
      await tools.createDocument({
        title: "Plano",
        markdown: "# Oi\n- item",
        ownerEmail: "a@arvore.com.br",
      })
    );

    expect(payload.url).toBe(`https://leaf.test/doc/${payload.id}`);
    expect(db.writes).toHaveLength(2);
    expect(db.writes[0].sql).toContain("INSERT INTO documents");

    const blocks = JSON.parse(db.writes[0].params[6] as string);

    expect(blocks.map((block: { type: string }) => block.type)).toEqual([
      "heading",
      "bulletListItem",
    ]);
    expect(db.writes[1].sql).toContain("documents_fts");
  });

  it("inherits org and teamspace from a page parent, refuses database parent", async () => {
    const db = fakeDb((sql) =>
      sql.includes("FROM user")
        ? [{ id: "u1" }]
        : [{ id: "p1", kind: "page", org_id: "org1", teamspace_id: "ts1" }]
    );
    const tools = new LeafMCPTools(db);

    await tools.createDocument({
      title: "Filha",
      markdown: "",
      ownerEmail: "a@arvore.com.br",
      parentId: "p1",
    });

    expect(db.writes[0].params[3]).toBe("org1");
    expect(db.writes[0].params[4]).toBe("ts1");

    const badDb = fakeDb((sql) =>
      sql.includes("FROM user")
        ? [{ id: "u1" }]
        : [{ id: "p1", kind: "database", org_id: null, teamspace_id: null }]
    );
    const payload = payloadOf(
      await new LeafMCPTools(badDb).createDocument({
        title: "x",
        markdown: "",
        ownerEmail: "a@arvore.com.br",
        parentId: "p1",
      })
    );

    expect(payload.error).toContain("Parent must be a page");
  });

  it("refuses unknown owners", async () => {
    const tools = new LeafMCPTools(fakeDb(() => []));
    const payload = payloadOf(
      await tools.createDocument({
        title: "x",
        markdown: "",
        ownerEmail: "ghost@arvore.com.br",
      })
    );

    expect(payload.error).toContain("No Leaf user");
  });
});

describe("updateDocument", () => {
  const baseDoc = {
    id: "d1",
    kind: "page",
    title: "Doc",
    content: JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "velho", styles: {} }] },
    ]),
    updated_at: "2026-09-01 10:00:00.000",
    recently_updated: 0,
  };

  function dbWith(doc: Row) {
    return fakeDb((sql) =>
      sql.includes("FROM user") ? [{ id: "u1" }] : [doc]
    );
  }

  it("appends blocks, snapshots a version and reindexes", async () => {
    const db = dbWith(baseDoc);
    const tools = new LeafMCPTools(db);

    const payload = payloadOf(
      await tools.updateDocument({
        documentId: "d1",
        markdown: "novo trecho",
        mode: "append",
        authorEmail: "a@arvore.com.br",
      })
    );

    expect(payload.blockCount).toBe(2);
    expect(db.writes.map((write) => write.sql.split(" ")[0])).toEqual([
      "INSERT",
      "UPDATE",
      "INSERT",
    ]);
    expect(db.writes[0].sql).toContain("document_versions");
    expect(db.writes[1].sql).toContain("updated_at = ?");
  });

  it("refuses documents updated in the live window", async () => {
    const tools = new LeafMCPTools(dbWith({ ...baseDoc, recently_updated: 1 }));
    const payload = payloadOf(
      await tools.updateDocument({
        documentId: "d1",
        markdown: "x",
        mode: "replace",
        authorEmail: "a@arvore.com.br",
      })
    );

    expect(payload.error).toContain("live collaboration");
  });

  it("reports a conflict when the optimistic update misses", async () => {
    const db = fakeDb(
      (sql) => (sql.includes("FROM user") ? [{ id: "u1" }] : [baseDoc]),
      0
    );
    const payload = payloadOf(
      await new LeafMCPTools(db).updateDocument({
        documentId: "d1",
        markdown: "x",
        mode: "replace",
        authorEmail: "a@arvore.com.br",
      })
    );

    expect(payload.error).toContain("concurrent edit");
  });
});

describe("manageInviteLink", () => {
  it("enables when missing, keeps existing on enable, resets and disables", async () => {
    const withToken = fakeDb(() => [
      { id: "org1", name: "Tech", invite_token: "tok123" },
    ]);
    const tools = new LeafMCPTools(withToken, "https://leaf.test");

    let payload = payloadOf(
      await tools.manageInviteLink({ orgId: "org1", action: "get" })
    );

    expect(payload.inviteUrl).toBe("https://leaf.test/join/tok123");
    expect(withToken.writes).toHaveLength(0);

    payload = payloadOf(
      await tools.manageInviteLink({ orgId: "org1", action: "enable" })
    );
    expect(payload.inviteUrl).toBe("https://leaf.test/join/tok123");
    expect(withToken.writes).toHaveLength(0);

    payload = payloadOf(
      await tools.manageInviteLink({ orgId: "org1", action: "reset" })
    );
    expect(payload.inviteUrl).not.toBe("https://leaf.test/join/tok123");
    expect(withToken.writes).toHaveLength(1);

    payload = payloadOf(
      await tools.manageInviteLink({ orgId: "org1", action: "disable" })
    );
    expect(payload.enabled).toBe(false);
    expect(payload.inviteUrl).toBeNull();
  });

  it("enables from scratch when there is no token", async () => {
    const db = fakeDb(() => [{ id: "org1", name: "Tech", invite_token: null }]);
    const payload = payloadOf(
      await new LeafMCPTools(db, "https://leaf.test").manageInviteLink({
        orgId: "org1",
        action: "enable",
      })
    );

    expect(payload.enabled).toBe(true);
    expect(payload.inviteUrl).toMatch(/^https:\/\/leaf\.test\/join\/.{20,}$/);
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
