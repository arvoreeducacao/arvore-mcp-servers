import { describe, it, expect, vi, beforeEach } from "vitest";
import { NPMClient } from "./npm-client.js";
import { NPMMCPError } from "./types.js";

global.fetch = vi.fn();

describe("NPMClient", () => {
  let client: NPMClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NPMClient();
  });

  describe("getPackageInfo", () => {
    it("should fetch package info successfully", async () => {
      const mockPackageInfo = {
        name: "express",
        version: "4.18.2",
        description: "Fast, unopinionated, minimalist web framework",
        homepage: "https://expressjs.com",
        repository: {
          type: "git",
          url: "git+https://github.com/expressjs/express.git",
        },
        license: "MIT",
        keywords: ["express", "framework", "web"],
        "dist-tags": { latest: "4.18.2" },
        versions: {},
        time: { created: "2024-01-01", modified: "2024-01-02" },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockPackageInfo,
      });

      const result = await client.getPackageInfo("express");

      expect(result.name).toBe("express");
      expect(result.version).toBe("4.18.2");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.npmjs.org/express"
      );
    });

    it("should throw NPMMCPError when package not found", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        client.getPackageInfo("non-existent-package")
      ).rejects.toThrow(NPMMCPError);
      await expect(
        client.getPackageInfo("non-existent-package")
      ).rejects.toThrow("not found");
    });

    it("should handle network errors", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      await expect(client.getPackageInfo("express")).rejects.toThrow(
        NPMMCPError
      );
      await expect(client.getPackageInfo("express")).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle non-404 HTTP errors", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.getPackageInfo("express")).rejects.toThrow(
        NPMMCPError
      );
      await expect(client.getPackageInfo("express")).rejects.toThrow(
        "Failed to fetch package info"
      );
    });

    it("should encode package names properly", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ name: "@scope/package", version: "1.0.0" }),
      });

      await client.getPackageInfo("@scope/package");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.npmjs.org/%40scope%2Fpackage"
      );
    });
  });

  describe("getPackageDownloads", () => {
    it("should fetch download stats successfully", async () => {
      const mockDownloadStats = {
        downloads: 10000000,
        start: "2024-01-01",
        end: "2024-01-07",
        package: "express",
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockDownloadStats,
      });

      const result = await client.getPackageDownloads("express");

      expect(result.downloads).toBe(10000000);
      expect(result.package).toBe("express");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.npmjs.org/downloads/point/last-week/express"
      );
    });

    it("should throw NPMMCPError when download stats not found", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(client.getPackageDownloads("non-existent")).rejects.toThrow(
        NPMMCPError
      );
      await expect(client.getPackageDownloads("non-existent")).rejects.toThrow(
        "Download stats for package"
      );
    });

    it("should handle network errors", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      await expect(client.getPackageDownloads("express")).rejects.toThrow(
        NPMMCPError
      );
      await expect(client.getPackageDownloads("express")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("searchPackages", () => {
    it("should search packages successfully", async () => {
      const mockSearchResponse = {
        objects: [
          {
            package: {
              name: "express",
              version: "4.18.2",
              description: "Fast web framework",
              keywords: ["web", "framework"],
              author: { name: "TJ Holowaychuk" },
              links: { npm: "https://www.npmjs.com/package/express" },
            },
            score: {
              final: 0.95,
              detail: { quality: 0.9, popularity: 0.95, maintenance: 0.98 },
            },
            searchScore: 100000,
          },
        ],
        total: 1,
        time: "Wed Jan 01 2024 00:00:00 GMT+0000",
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockSearchResponse,
      });

      const result = await client.searchPackages("express", 20);

      expect(result.objects).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.objects[0].package.name).toBe("express");
    });

    it("should handle default size parameter", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ objects: [], total: 0, time: "" }),
      });

      await client.searchPackages("test");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.npmjs.org/-/v1/search?text=test&size=20"
      );
    });

    it("should handle custom size parameter", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ objects: [], total: 0, time: "" }),
      });

      await client.searchPackages("test", 50);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://registry.npmjs.org/-/v1/search?text=test&size=50"
      );
    });

    it("should throw NPMMCPError on search failure", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.searchPackages("test")).rejects.toThrow(NPMMCPError);
      await expect(client.searchPackages("test")).rejects.toThrow(
        "Failed to search packages"
      );
    });

    it("should handle network errors", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      await expect(client.searchPackages("test")).rejects.toThrow(NPMMCPError);
      await expect(client.searchPackages("test")).rejects.toThrow(
        "Network error"
      );
    });

    it("should encode search query properly", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ objects: [], total: 0, time: "" }),
      });

      await client.searchPackages("@scope/package test", 20);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("%40scope%2Fpackage%20test")
      );
    });
  });
});
