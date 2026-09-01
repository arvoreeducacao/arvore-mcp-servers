import { randomBytes } from "node:crypto";
import { QueryRunner } from "./database.js";
import { contentToMarkdown, LeafBlock } from "./markdown.js";
import {
  markdownToBlocks,
  plainTextOfMarkdown,
} from "./markdown-to-blocks.js";
import {
  CreateDocumentParams,
  GetDatabaseParams,
  GetDocumentParams,
  InviteLinkParams,
  LeafMCPError,
  ListCommentsParams,
  ListDocumentsParams,
  McpToolResult,
  SearchDocumentsParams,
  UpdateDocumentParams,
} from "./types.js";

const liveSessionWindowSeconds = 15;

function appId(): string {
  return randomBytes(9).toString("base64url");
}

function inviteToken(): string {
  return randomBytes(18).toString("base64url");
}

interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

function ok(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(error: unknown, context: Record<string, unknown> = {}): McpToolResult {
  const message =
    error instanceof LeafMCPError
      ? `Leaf error: ${error.message}`
      : `Unexpected error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, ...context }, null, 2),
      },
    ],
  };
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class LeafMCPTools {
  constructor(
    private db: QueryRunner,
    private baseUrl: string = "https://leaf.arvore.com.br"
  ) {}

  private async resolveUser(email: string): Promise<string> {
    const rows = await this.db.query(
      "SELECT id FROM user WHERE email = ? LIMIT 1",
      [email.trim().toLowerCase()]
    );
    const user = rows[0];

    if (!user) {
      throw new LeafMCPError(
        `No Leaf user with email ${email}`,
        "USER_NOT_FOUND"
      );
    }

    return user.id as string;
  }

  private async writeSearchIndex(
    documentId: string,
    title: string,
    body: string
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO documents_fts (document_id, title, body, indexed_at)
       VALUES (?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body),
                               indexed_at = VALUES(indexed_at)`,
      [documentId, title, body]
    );
  }

  async searchDocuments(params: SearchDocumentsParams): Promise<McpToolResult> {
    try {
      let rows = await this.db.query(
        `SELECT d.id, d.title, d.kind, d.updated_at,
                MATCH(f.title, f.body) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
         FROM documents_fts f
         JOIN documents d ON d.id = f.document_id
         WHERE d.deleted_at IS NULL
           AND MATCH(f.title, f.body) AGAINST (? IN NATURAL LANGUAGE MODE)
         ORDER BY score DESC
         LIMIT ?`,
        [params.query, params.query, params.limit]
      );

      if (rows.length === 0) {
        rows = await this.db.query(
          `SELECT id, title, kind, updated_at, NULL AS score
           FROM documents
           WHERE deleted_at IS NULL AND title LIKE ?
           ORDER BY updated_at DESC
           LIMIT ?`,
          [`%${params.query}%`, params.limit]
        );
      }

      return ok({ query: params.query, resultCount: rows.length, results: rows });
    } catch (error) {
      return fail(error, { query: params.query });
    }
  }

  async getDocument(params: GetDocumentParams): Promise<McpToolResult> {
    try {
      const rows = await this.db.query(
        `SELECT d.id, d.title, d.kind, d.content, d.properties, d.parent_id,
                d.org_access, d.created_at, d.updated_at,
                u.email AS owner_email, o.name AS org_name, t.name AS teamspace_name
         FROM documents d
         JOIN user u ON u.id = d.owner_id
         LEFT JOIN organizations o ON o.id = d.org_id
         LEFT JOIN teamspaces t ON t.id = d.teamspace_id
         WHERE d.id = ? AND d.deleted_at IS NULL`,
        [params.documentId]
      );

      const document = rows[0];

      if (!document) {
        return fail(new LeafMCPError("Document not found", "NOT_FOUND"), {
          documentId: params.documentId,
        });
      }

      const children = await this.db.query(
        `SELECT id, title, kind FROM documents
         WHERE parent_id = ? AND deleted_at IS NULL AND kind <> 'row'
         ORDER BY updated_at DESC`,
        [params.documentId]
      );

      return ok({
        id: document.id,
        title: document.title,
        kind: document.kind,
        ownerEmail: document.owner_email,
        organization: document.org_name,
        orgAccess: document.org_access,
        teamspace: document.teamspace_name,
        parentId: document.parent_id,
        createdAt: document.created_at,
        updatedAt: document.updated_at,
        markdown: contentToMarkdown(document.content as string | null),
        rowValues:
          document.kind === "row" ? parseJson(document.properties) : undefined,
        children,
      });
    } catch (error) {
      return fail(error, { documentId: params.documentId });
    }
  }

  async listDocuments(params: ListDocumentsParams): Promise<McpToolResult> {
    try {
      const conditions = ["d.deleted_at IS NULL", "d.kind <> 'row'"];
      const values: Array<unknown> = [];

      if (params.orgId) {
        conditions.push("d.org_id = ?");
        values.push(params.orgId);
      }

      if (params.ownerEmail) {
        conditions.push("u.email = ?");
        values.push(params.ownerEmail);
      }

      const rows = await this.db.query(
        `SELECT d.id, d.title, d.kind, d.parent_id, d.org_access,
                d.teamspace_id, d.updated_at, u.email AS owner_email
         FROM documents d
         JOIN user u ON u.id = d.owner_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY d.updated_at DESC
         LIMIT ?`,
        [...values, params.limit]
      );

      return ok({ documentCount: rows.length, documents: rows });
    } catch (error) {
      return fail(error);
    }
  }

  async listOrganizations(): Promise<McpToolResult> {
    try {
      const organizations = await this.db.query(
        `SELECT o.id, o.name, o.created_at, COUNT(om.id) AS member_count
         FROM organizations o
         LEFT JOIN organization_members om ON om.org_id = o.id
         GROUP BY o.id
         ORDER BY o.created_at`
      );

      const members = await this.db.query(
        `SELECT om.org_id, u.email, om.role
         FROM organization_members om
         JOIN user u ON u.id = om.user_id
         ORDER BY om.created_at`
      );

      const teamspaces = await this.db.query(
        `SELECT org_id, name, access FROM teamspaces ORDER BY created_at`
      );

      return ok({
        organizationCount: organizations.length,
        organizations: organizations.map((org) => ({
          ...org,
          members: members.filter((member) => member.org_id === org.id),
          teamspaces: teamspaces.filter((space) => space.org_id === org.id),
        })),
      });
    } catch (error) {
      return fail(error);
    }
  }

  async getDatabase(params: GetDatabaseParams): Promise<McpToolResult> {
    try {
      const documents = await this.db.query(
        `SELECT id, title, kind FROM documents
         WHERE id = ? AND deleted_at IS NULL`,
        [params.databaseId]
      );

      const database = documents[0];

      if (!database || database.kind !== "database") {
        return fail(new LeafMCPError("Database not found", "NOT_FOUND"), {
          databaseId: params.databaseId,
        });
      }

      const properties = await this.db.query(
        `SELECT id, name, type, options, position
         FROM database_properties
         WHERE database_id = ?
         ORDER BY position`,
        [params.databaseId]
      );

      const views = await this.db.query(
        `SELECT name, type, position FROM database_views
         WHERE database_id = ?
         ORDER BY position`,
        [params.databaseId]
      );

      const rows = await this.db.query(
        `SELECT id, title, properties, created_at, updated_at
         FROM documents
         WHERE parent_id = ? AND kind = 'row' AND deleted_at IS NULL
         ORDER BY created_at`,
        [params.databaseId]
      );

      const optionNames = new Map<string, string>();

      for (const property of properties) {
        const options = parseJson(property.options);

        if (Array.isArray(options)) {
          for (const option of options as Array<SelectOption>) {
            optionNames.set(`${property.id}:${option.id}`, option.name);
          }
        }
      }

      const resolveValue = (
        propertyId: string,
        type: unknown,
        value: unknown
      ): unknown => {
        if (type === "select" && typeof value === "string") {
          return optionNames.get(`${propertyId}:${value}`) ?? value;
        }

        if (type === "multiSelect" && Array.isArray(value)) {
          return value.map((item) =>
            typeof item === "string"
              ? (optionNames.get(`${propertyId}:${item}`) ?? item)
              : item
          );
        }

        return value;
      };

      return ok({
        id: database.id,
        title: database.title,
        properties: properties.map((property) => ({
          id: property.id,
          name: property.name,
          type: property.type,
          options: parseJson(property.options),
        })),
        views,
        rowCount: rows.length,
        rows: rows.map((row) => {
          const raw = parseJson(row.properties);
          const values: Record<string, unknown> = {};

          if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            for (const property of properties) {
              const value = (raw as Record<string, unknown>)[
                property.id as string
              ];

              if (value !== undefined && value !== null) {
                values[property.name as string] = resolveValue(
                  property.id as string,
                  property.type,
                  value
                );
              }
            }
          }

          return {
            id: row.id,
            title: row.title,
            values,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }),
      });
    } catch (error) {
      return fail(error, { databaseId: params.databaseId });
    }
  }

  async createDocument(params: CreateDocumentParams): Promise<McpToolResult> {
    try {
      const ownerId = await this.resolveUser(params.ownerEmail);

      let orgId: string | null = null;
      let teamspaceId: string | null = null;

      if (params.parentId) {
        const parents = await this.db.query(
          `SELECT id, kind, org_id, teamspace_id FROM documents
           WHERE id = ? AND deleted_at IS NULL`,
          [params.parentId]
        );
        const parent = parents[0];

        if (!parent) {
          throw new LeafMCPError("Parent document not found", "NOT_FOUND");
        }

        if (parent.kind !== "page") {
          throw new LeafMCPError(
            "Parent must be a page (database children are rows)",
            "INVALID_PARENT"
          );
        }

        orgId = (parent.org_id as string | null) ?? null;
        teamspaceId = (parent.teamspace_id as string | null) ?? null;
      }

      const id = appId();
      const blocks = markdownToBlocks(params.markdown);

      await this.db.execute(
        `INSERT INTO documents
           (id, owner_id, parent_id, org_id, teamspace_id, kind, title,
            content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'page', ?, ?, NOW(3), NOW(3))`,
        [
          id,
          ownerId,
          params.parentId ?? null,
          orgId,
          teamspaceId,
          params.title,
          JSON.stringify(blocks),
        ]
      );
      await this.writeSearchIndex(
        id,
        params.title,
        plainTextOfMarkdown(params.markdown)
      );

      return ok({
        id,
        title: params.title,
        url: `${this.baseUrl}/doc/${id}`,
        parentId: params.parentId ?? null,
      });
    } catch (error) {
      return fail(error, { title: params.title });
    }
  }

  async updateDocument(params: UpdateDocumentParams): Promise<McpToolResult> {
    try {
      const authorId = await this.resolveUser(params.authorEmail);
      const rows = await this.db.query(
        `SELECT id, kind, title, content, updated_at,
                updated_at > NOW(3) - INTERVAL ? SECOND AS recently_updated
         FROM documents
         WHERE id = ? AND deleted_at IS NULL`,
        [liveSessionWindowSeconds, params.documentId]
      );
      const document = rows[0];

      if (!document) {
        throw new LeafMCPError("Document not found", "NOT_FOUND");
      }

      if (document.kind !== "page") {
        throw new LeafMCPError(
          "Only pages can be edited (databases and rows are out of scope)",
          "INVALID_KIND"
        );
      }

      if (Number(document.recently_updated) === 1) {
        throw new LeafMCPError(
          `Document was updated in the last ${liveSessionWindowSeconds}s — it is probably open in a live collaboration session, and a direct write would be silently overwritten. Try again in a moment.`,
          "DOCUMENT_LIVE"
        );
      }

      const newBlocks = markdownToBlocks(params.markdown);
      let blocks: Array<LeafBlock> = newBlocks;

      if (params.mode === "append") {
        const existing = parseJson(document.content);

        if (Array.isArray(existing)) {
          blocks = [...(existing as Array<LeafBlock>), ...newBlocks];
        }
      }

      await this.db.execute(
        `INSERT INTO document_versions
           (id, document_id, title, content, author_id, created_at)
         VALUES (?, ?, ?, ?, ?, NOW(3))`,
        [
          appId(),
          document.id,
          document.title,
          document.content,
          authorId,
        ]
      );

      const affected = await this.db.execute(
        `UPDATE documents SET content = ?, updated_at = NOW(3)
         WHERE id = ? AND updated_at = ?`,
        [JSON.stringify(blocks), document.id, document.updated_at]
      );

      if (affected === 0) {
        throw new LeafMCPError(
          "Document changed while writing (concurrent edit) — nothing was saved. Read it again and retry.",
          "CONFLICT"
        );
      }

      await this.writeSearchIndex(
        document.id as string,
        document.title as string,
        contentToMarkdown(JSON.stringify(blocks))
      );

      return ok({
        id: document.id,
        mode: params.mode,
        blockCount: blocks.length,
        url: `${this.baseUrl}/doc/${document.id}`,
      });
    } catch (error) {
      return fail(error, { documentId: params.documentId });
    }
  }

  async manageInviteLink(params: InviteLinkParams): Promise<McpToolResult> {
    try {
      const rows = await this.db.query(
        "SELECT id, name, invite_token FROM organizations WHERE id = ?",
        [params.orgId]
      );
      const organization = rows[0];

      if (!organization) {
        throw new LeafMCPError("Organization not found", "NOT_FOUND");
      }

      let token = (organization.invite_token as string | null) ?? null;

      if (params.action === "disable" && token !== null) {
        await this.db.execute(
          "UPDATE organizations SET invite_token = NULL WHERE id = ?",
          [params.orgId]
        );
        token = null;
      }

      if (
        (params.action === "enable" && token === null) ||
        params.action === "reset"
      ) {
        token = inviteToken();
        await this.db.execute(
          "UPDATE organizations SET invite_token = ? WHERE id = ?",
          [token, params.orgId]
        );
      }

      return ok({
        orgId: organization.id,
        organization: organization.name,
        action: params.action,
        enabled: token !== null,
        inviteUrl: token ? `${this.baseUrl}/join/${token}` : null,
      });
    } catch (error) {
      return fail(error, { orgId: params.orgId });
    }
  }

  async listComments(params: ListCommentsParams): Promise<McpToolResult> {
    try {
      const rows = await this.db.query(
        `SELECT c.id, c.parent_id, c.block_id, c.body, c.resolved_at,
                c.created_at, u.email AS author_email, u.name AS author_name
         FROM comments c
         LEFT JOIN user u ON u.id = c.author_id
         WHERE c.document_id = ?
         ORDER BY c.created_at`,
        [params.documentId]
      );

      const threads = rows
        .filter((row) => row.parent_id === null)
        .map((thread) => ({
          id: thread.id,
          blockId: thread.block_id,
          body: thread.body,
          author: thread.author_name ?? thread.author_email,
          resolved: thread.resolved_at !== null,
          createdAt: thread.created_at,
          replies: rows
            .filter((row) => row.parent_id === thread.id)
            .map((reply) => ({
              body: reply.body,
              author: reply.author_name ?? reply.author_email,
              createdAt: reply.created_at,
            })),
        }));

      return ok({
        documentId: params.documentId,
        threadCount: threads.length,
        threads,
      });
    } catch (error) {
      return fail(error, { documentId: params.documentId });
    }
  }
}
