import { z } from "zod";

export const PackageInfoParamsSchema = z.object({
  packageName: z.string().min(1, "Package name is required"),
});

export const PackageDownloadsParamsSchema = z.object({
  packageName: z.string().min(1, "Package name is required"),
});

export const PackageSearchParamsSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  size: z.number().int().positive().max(250).optional().default(20),
});

export type PackageInfoParams = z.infer<typeof PackageInfoParamsSchema>;
export type PackageDownloadsParams = z.infer<
  typeof PackageDownloadsParamsSchema
>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class NPMMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "NPMMCPError";
  }
}

export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
  };
  author?: string | { name: string; email?: string };
  license?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  maintainers?: Array<{ name: string; email: string }>;
  time?: {
    created: string;
    modified: string;
    [version: string]: string;
  };
  "dist-tags"?: {
    latest: string;
    [tag: string]: string;
  };
  versions?: Record<string, unknown>;
}

export interface DownloadStats {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

export interface SearchResult {
  package: {
    name: string;
    version: string;
    description?: string;
    keywords?: string[];
    author?: { name: string };
    publisher?: { username: string; email: string };
    maintainers?: Array<{ username: string; email: string }>;
    links?: {
      npm?: string;
      homepage?: string;
      repository?: string;
      bugs?: string;
    };
  };
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  searchScore: number;
}

export interface SearchResponse {
  objects: SearchResult[];
  total: number;
  time: string;
}
