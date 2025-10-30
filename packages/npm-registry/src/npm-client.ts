import {
  NPMMCPError,
  PackageInfo,
  DownloadStats,
  SearchResponse,
} from "./types.js";

export class NPMClient {
  private static readonly REGISTRY_BASE_URL = "https://registry.npmjs.org";
  private static readonly DOWNLOADS_BASE_URL =
    "https://api.npmjs.org/downloads";

  async getPackageInfo(packageName: string): Promise<PackageInfo> {
    try {
      const url = `${NPMClient.REGISTRY_BASE_URL}/${encodeURIComponent(
        packageName
      )}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new NPMMCPError(
            `Package "${packageName}" not found`,
            "PACKAGE_NOT_FOUND",
            404
          );
        }
        throw new NPMMCPError(
          `Failed to fetch package info: ${response.statusText}`,
          "FETCH_ERROR",
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NPMMCPError) {
        throw error;
      }
      throw new NPMMCPError(
        `Network error while fetching package info: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "NETWORK_ERROR"
      );
    }
  }

  async getPackageDownloads(packageName: string): Promise<DownloadStats> {
    try {
      const url = `${
        NPMClient.DOWNLOADS_BASE_URL
      }/point/last-week/${encodeURIComponent(packageName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new NPMMCPError(
            `Download stats for package "${packageName}" not found`,
            "DOWNLOADS_NOT_FOUND",
            404
          );
        }
        throw new NPMMCPError(
          `Failed to fetch download stats: ${response.statusText}`,
          "FETCH_ERROR",
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NPMMCPError) {
        throw error;
      }
      throw new NPMMCPError(
        `Network error while fetching download stats: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "NETWORK_ERROR"
      );
    }
  }

  async searchPackages(
    query: string,
    size: number = 20
  ): Promise<SearchResponse> {
    try {
      const url = `${
        NPMClient.REGISTRY_BASE_URL
      }/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new NPMMCPError(
          `Failed to search packages: ${response.statusText}`,
          "SEARCH_ERROR",
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof NPMMCPError) {
        throw error;
      }
      throw new NPMMCPError(
        `Network error while searching packages: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "NETWORK_ERROR"
      );
    }
  }
}
