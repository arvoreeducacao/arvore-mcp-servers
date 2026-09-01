import { QueryRunner } from "./database.js";
import { contentToMarkdown } from "./markdown.js";
import {
  GetDatabaseParams,
  GetDocumentParams,
  LeafMCPError,
  ListCommentsParams,
  ListDocumentsParams,
  McpToolResult,
  SearchDocumentsParams,
} from "./types.js";

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
  constructor(private db: QueryRunner) {}

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
