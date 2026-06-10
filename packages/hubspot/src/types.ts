import { z } from "zod";

export const CrmObjectTypeSchema = z
  .string()
  .min(1)
  .describe(
    "HubSpot object type. Standard: contacts, companies, deals, tickets. Activities: notes, tasks, calls, emails, meetings. Or a custom objectTypeId (e.g. 2-12345)."
  );

export const ListObjectsParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  limit: z.number().int().positive().max(100).optional().default(20).describe("Max records per page (<=100)"),
  after: z.string().optional().describe("Paging cursor from the previous response"),
  properties: z.array(z.string()).optional().describe("Property names to return"),
  associations: z.array(z.string()).optional().describe("Object types to fetch associated record IDs for"),
  archived: z.boolean().optional().default(false).describe("Return only archived records"),
});

export const GetObjectParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  objectId: z.string().min(1, "objectId is required"),
  idProperty: z.string().optional().describe("Unique property to use as the lookup key instead of the record ID"),
  properties: z.array(z.string()).optional(),
  associations: z.array(z.string()).optional(),
  archived: z.boolean().optional().default(false),
});

export const CreateObjectParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).describe("Property values for the new record"),
  associations: z
    .array(
      z.object({
        toObjectId: z.string(),
        associationTypeId: z.number().int(),
        associationCategory: z
          .enum(["HUBSPOT_DEFINED", "USER_DEFINED", "INTEGRATOR_DEFINED"])
          .optional()
          .default("HUBSPOT_DEFINED"),
      })
    )
    .optional()
    .describe("Records to associate on creation"),
});

export const UpdateObjectParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  objectId: z.string().min(1, "objectId is required"),
  idProperty: z.string().optional(),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const DeleteObjectParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  objectId: z.string().min(1, "objectId is required"),
});

const SearchFilterSchema = z.object({
  propertyName: z.string(),
  operator: z
    .enum([
      "EQ",
      "NEQ",
      "LT",
      "LTE",
      "GT",
      "GTE",
      "BETWEEN",
      "IN",
      "NOT_IN",
      "HAS_PROPERTY",
      "NOT_HAS_PROPERTY",
      "CONTAINS_TOKEN",
      "NOT_CONTAINS_TOKEN",
    ])
    .describe("Comparison operator"),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional().describe("Used with IN / NOT_IN"),
  highValue: z.union([z.string(), z.number()]).optional().describe("Upper bound for BETWEEN"),
});

export const SearchObjectsParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  query: z.string().optional().describe("Free-text query across default searchable properties"),
  filterGroups: z
    .array(z.object({ filters: z.array(SearchFilterSchema) }))
    .max(6)
    .optional()
    .describe("Up to 6 filter groups (OR between groups, AND within a group)"),
  properties: z.array(z.string()).optional(),
  sorts: z
    .array(z.object({ propertyName: z.string(), direction: z.enum(["ASCENDING", "DESCENDING"]) }))
    .optional(),
  limit: z.number().int().positive().max(200).optional().default(20),
  after: z.string().optional(),
});

export const BatchReadParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  ids: z.array(z.string()).min(1).max(100).describe("Record IDs (or idProperty values) to read"),
  idProperty: z.string().optional(),
  properties: z.array(z.string()).optional(),
});

export const ListAssociationsParamsSchema = z.object({
  fromObjectType: CrmObjectTypeSchema,
  fromObjectId: z.string().min(1),
  toObjectType: CrmObjectTypeSchema,
  limit: z.number().int().positive().max(500).optional().default(100),
  after: z.string().optional(),
});

export const CreateAssociationParamsSchema = z.object({
  fromObjectType: CrmObjectTypeSchema,
  fromObjectId: z.string().min(1),
  toObjectType: CrmObjectTypeSchema,
  toObjectId: z.string().min(1),
  types: z
    .array(
      z.object({
        associationCategory: z
          .enum(["HUBSPOT_DEFINED", "USER_DEFINED", "INTEGRATOR_DEFINED"])
          .default("HUBSPOT_DEFINED"),
        associationTypeId: z.number().int(),
      })
    )
    .optional()
    .describe("Labeled association types. Omit to create the default (unlabeled) association."),
});

export const DeleteAssociationParamsSchema = z.object({
  fromObjectType: CrmObjectTypeSchema,
  fromObjectId: z.string().min(1),
  toObjectType: CrmObjectTypeSchema,
  toObjectId: z.string().min(1),
});

export const ListPipelinesParamsSchema = z.object({
  objectType: CrmObjectTypeSchema.describe("Object type with pipelines, e.g. deals or tickets"),
});

export const ListPropertiesParamsSchema = z.object({
  objectType: CrmObjectTypeSchema,
  archived: z.boolean().optional().default(false),
});

export const ListInboxesParamsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(20),
  after: z.string().optional(),
});

export const ListThreadsParamsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(20),
  after: z.string().optional(),
  inboxId: z.string().optional(),
  threadStatus: z.enum(["OPEN", "CLOSED"]).optional(),
  sort: z.string().optional().describe("Sort field, e.g. latestMessageTimestamp or -latestMessageTimestamp"),
});

export const GetThreadParamsSchema = z.object({
  threadId: z.string().min(1),
});

export const ListThreadMessagesParamsSchema = z.object({
  threadId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  after: z.string().optional(),
});

export const SendThreadMessageParamsSchema = z.object({
  threadId: z.string().min(1),
  text: z.string().min(1, "Message text is required"),
  richText: z.string().optional().describe("HTML body; falls back to text if omitted"),
  senderActorId: z.string().min(1).describe("Actor ID of the sender, e.g. A-<userId>"),
  channelId: z.string().min(1).describe("Channel ID the message is sent through"),
  channelAccountId: z.string().min(1).describe("Channel account ID the message is sent through"),
  subject: z.string().optional(),
});

export const UpdateThreadParamsSchema = z.object({
  threadId: z.string().min(1),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  archived: z.boolean().optional(),
});

export type ListObjectsParams = z.infer<typeof ListObjectsParamsSchema>;
export type GetObjectParams = z.infer<typeof GetObjectParamsSchema>;
export type CreateObjectParams = z.infer<typeof CreateObjectParamsSchema>;
export type UpdateObjectParams = z.infer<typeof UpdateObjectParamsSchema>;
export type DeleteObjectParams = z.infer<typeof DeleteObjectParamsSchema>;
export type SearchObjectsParams = z.infer<typeof SearchObjectsParamsSchema>;
export type BatchReadParams = z.infer<typeof BatchReadParamsSchema>;
export type ListAssociationsParams = z.infer<typeof ListAssociationsParamsSchema>;
export type CreateAssociationParams = z.infer<typeof CreateAssociationParamsSchema>;
export type DeleteAssociationParams = z.infer<typeof DeleteAssociationParamsSchema>;
export type ListPipelinesParams = z.infer<typeof ListPipelinesParamsSchema>;
export type ListPropertiesParams = z.infer<typeof ListPropertiesParamsSchema>;
export type ListInboxesParams = z.infer<typeof ListInboxesParamsSchema>;
export type ListThreadsParams = z.infer<typeof ListThreadsParamsSchema>;
export type GetThreadParams = z.infer<typeof GetThreadParamsSchema>;
export type ListThreadMessagesParams = z.infer<typeof ListThreadMessagesParamsSchema>;
export type SendThreadMessageParams = z.infer<typeof SendThreadMessageParamsSchema>;
export type UpdateThreadParams = z.infer<typeof UpdateThreadParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class HubSpotMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "HubSpotMCPError";
  }
}
