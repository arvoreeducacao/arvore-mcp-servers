import { z } from "zod";

export const MetabaseConfigSchema = z.object({
  url: z.string().url("Metabase URL is required"),
  apiKey: z.string().min(1, "API key is required"),
});

export type MetabaseConfig = z.infer<typeof MetabaseConfigSchema>;

export const ListCardsParamsSchema = z.object({
  filter: z
    .enum(["all", "mine", "bookmarked", "archived", "recent", "popular"])
    .default("all")
    .describe("Filter cards by category"),
});

export type ListCardsParams = z.infer<typeof ListCardsParamsSchema>;

export const GetCardParamsSchema = z.object({
  id: z.number().int().positive().describe("Card ID"),
});

export type GetCardParams = z.infer<typeof GetCardParamsSchema>;

export const CreateCardParamsSchema = z.object({
  name: z.string().min(1).describe("Card name"),
  dataset_query: z
    .object({
      type: z.enum(["native", "query"]).describe("Query type"),
      native: z
        .object({
          query: z.string().describe("SQL query"),
        })
        .optional(),
      query: z
        .object({
          "source-table": z.number().optional().describe("Source table ID"),
        })
        .optional(),
      database: z.number().describe("Database ID"),
    })
    .describe("Query definition"),
  display: z
    .enum(["table", "bar", "line", "pie", "scalar", "row", "area", "combo", "funnel", "scatter", "waterfall", "progress", "gauge", "map"])
    .default("table")
    .describe("Visualization type"),
  description: z.string().optional().describe("Card description"),
  collection_id: z.number().optional().describe("Collection ID to save the card in"),
  visualization_settings: z.record(z.unknown()).optional().describe("Visualization settings"),
});

export type CreateCardParams = z.infer<typeof CreateCardParamsSchema>;

export const UpdateCardParamsSchema = z.object({
  id: z.number().int().positive().describe("Card ID"),
  name: z.string().optional().describe("New card name"),
  description: z.string().optional().describe("New description"),
  display: z.string().optional().describe("New visualization type"),
  visualization_settings: z.record(z.unknown()).optional().describe("New visualization settings"),
});

export type UpdateCardParams = z.infer<typeof UpdateCardParamsSchema>;

export const DeleteCardParamsSchema = z.object({
  id: z.number().int().positive().describe("Card ID"),
});

export type DeleteCardParams = z.infer<typeof DeleteCardParamsSchema>;

export const RunCardQueryParamsSchema = z.object({
  id: z.number().int().positive().describe("Card ID"),
  parameters: z.array(z.record(z.unknown())).optional().describe("Query parameters"),
});

export type RunCardQueryParams = z.infer<typeof RunCardQueryParamsSchema>;

export const ListDashboardsParamsSchema = z.object({
  filter: z
    .enum(["all", "mine", "archived"])
    .default("all")
    .describe("Filter dashboards"),
});

export type ListDashboardsParams = z.infer<typeof ListDashboardsParamsSchema>;

export const GetDashboardParamsSchema = z.object({
  id: z.number().int().positive().describe("Dashboard ID"),
});

export type GetDashboardParams = z.infer<typeof GetDashboardParamsSchema>;

export const CreateDashboardParamsSchema = z.object({
  name: z.string().min(1).describe("Dashboard name"),
  description: z.string().optional().describe("Dashboard description"),
  collection_id: z.number().optional().describe("Collection ID"),
  parameters: z.array(z.record(z.unknown())).optional().describe("Dashboard filter parameters"),
});

export type CreateDashboardParams = z.infer<typeof CreateDashboardParamsSchema>;

export const AddCardToDashboardParamsSchema = z.object({
  dashboard_id: z.number().int().positive().describe("Dashboard ID"),
  card_id: z.number().int().positive().describe("Card ID to add"),
  row: z.number().int().nonnegative().default(0).describe("Row position in grid"),
  col: z.number().int().nonnegative().default(0).describe("Column position in grid"),
  size_x: z.number().int().positive().default(6).describe("Width in grid units"),
  size_y: z.number().int().positive().default(4).describe("Height in grid units"),
});

export type AddCardToDashboardParams = z.infer<typeof AddCardToDashboardParamsSchema>;

export const DeleteDashboardParamsSchema = z.object({
  id: z.number().int().positive().describe("Dashboard ID"),
});

export type DeleteDashboardParams = z.infer<typeof DeleteDashboardParamsSchema>;

export const ListCollectionsParamsSchema = z.object({
  namespace: z.string().optional().describe("Collection namespace filter"),
});
export const GetCollectionItemsParamsSchema = z.object({
  id: z.number().int().positive().describe("Collection ID"),
});

export type GetCollectionItemsParams = z.infer<typeof GetCollectionItemsParamsSchema>;

export type ListCollectionsParams = z.infer<typeof ListCollectionsParamsSchema>;

export const CreateCollectionParamsSchema = z.object({
  name: z.string().min(1).describe("Collection name"),
  description: z.string().optional().describe("Collection description"),
  parent_id: z.number().optional().describe("Parent collection ID"),
  color: z.string().optional().describe("Collection color hex"),
});

export type CreateCollectionParams = z.infer<typeof CreateCollectionParamsSchema>;

export const ListDatabasesParamsSchema = z.object({});

export type ListDatabasesParams = z.infer<typeof ListDatabasesParamsSchema>;

export const RunQueryParamsSchema = z.object({
  database: z.number().int().positive().describe("Database ID"),
  query: z.string().min(1).describe("SQL query to execute"),
});

export type RunQueryParams = z.infer<typeof RunQueryParamsSchema>;

export const ListTablesParamsSchema = z.object({
  database_id: z.number().int().positive().describe("Database ID"),
});

export type ListTablesParams = z.infer<typeof ListTablesParamsSchema>;

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class MetabaseMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "MetabaseMCPError";
  }
}
