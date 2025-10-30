import { describe, it, expect, vi, beforeEach } from "vitest";
import { NPMMCPTools } from "./tools.js";
import { NPMClient } from "./npm-client.js";
import { NPMMCPError } from "./types.js";

vi.mock("./npm-client.js", () => ({
  NPMClient: vi.fn(),
}));

describe("NPMMCPTools", () => {
  let tools: NPMMCPTools;
  let mockClient: {
    getPackageInfo: ReturnType<typeof vi.fn>;
    getPackageDownloads: ReturnType<typeof vi.fn>;
    searchPackages: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getPackageInfo: vi.fn(),
      getPackageDownloads: vi.fn(),
      searchPackages: vi.fn(),
    };
    tools = new NPMMCPTools(mockClient as unknown as NPMClient);
  });

  describe("getPackageInfo", () => {
    it("should return formatted package info", async () => {
      mockClient.getPackageInfo.mockResolvedValue({
        name: "express",
        version: "4.18.2",
        description: "Fast web framework",
        homepage: "https://expressjs.com",
        repository: {
          type: "git",
          url: "git+https://github.com/expressjs/express.git",
        },
        author: { name: "TJ Holowaychuk", email: "tj@vision-media.ca" },
        license: "MIT",
        keywords: ["express", "framework", "web"],
        dependencies: { accepts: "~1.3.8" },
        devDependencies: { mocha: "^10.0.0" },
        scripts: { test: "mocha" },
        maintainers: [{ name: "dougwilson", email: "doug@somethingdoug.com" }],
        time: { created: "2024-01-01", modified: "2024-01-02" },
        "dist-tags": { latest: "4.18.2" },
        versions: { "4.18.2": {}, "4.18.1": {} },
      });

      const result = await tools.getPackageInfo({ packageName: "express" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe("express");
      expect(parsed.version).toBe("4.18.2");
      expect(parsed.description).toBe("Fast web framework");
      expect(parsed.license).toBe("MIT");
      expect(parsed.keywords).toContain("express");
      expect(parsed.maintainers).toHaveLength(1);
    });

    it("should handle package with versions object", async () => {
      mockClient.getPackageInfo.mockResolvedValue({
        name: "test-package",
        "dist-tags": { latest: "2.0.0" },
        versions: {
          "2.0.0": {
            name: "test-package",
            version: "2.0.0",
            description: "Version 2.0.0 description",
            dependencies: { dep1: "^1.0.0" },
          },
          "1.0.0": {},
        },
        time: {},
      });

      const result = await tools.getPackageInfo({
        packageName: "test-package",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.version).toBe("2.0.0");
      expect(parsed.description).toBe("Version 2.0.0 description");
    });

    it("should return error result when package not found", async () => {
      mockClient.getPackageInfo.mockRejectedValue(
        new NPMMCPError("Package not found", "PACKAGE_NOT_FOUND", 404)
      );

      const result = await tools.getPackageInfo({
        packageName: "non-existent",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("NPM Error");
      expect(parsed.packageName).toBe("non-existent");
    });

    it("should handle unexpected errors", async () => {
      mockClient.getPackageInfo.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await tools.getPackageInfo({ packageName: "express" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Unexpected error");
    });

    it("should show available versions limited to last 10", async () => {
      const versions: Record<string, unknown> = {};
      for (let i = 1; i <= 15; i++) {
        versions[`1.0.${i}`] = {};
      }

      mockClient.getPackageInfo.mockResolvedValue({
        name: "test-package",
        "dist-tags": { latest: "1.0.15" },
        versions,
        time: {},
      });

      const result = await tools.getPackageInfo({
        packageName: "test-package",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.availableVersions).toHaveLength(10);
    });
  });

  describe("getPackageDownloads", () => {
    it("should return formatted download stats", async () => {
      mockClient.getPackageDownloads.mockResolvedValue({
        downloads: 10000000,
        start: "2024-01-01",
        end: "2024-01-07",
        package: "express",
      });

      const result = await tools.getPackageDownloads({
        packageName: "express",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.package).toBe("express");
      expect(parsed.downloads).toBe(10000000);
      expect(parsed.period).toBe("2024-01-01 to 2024-01-07");
      expect(parsed.averagePerDay).toBe(Math.round(10000000 / 7));
    });

    it("should return error result when downloads not found", async () => {
      mockClient.getPackageDownloads.mockRejectedValue(
        new NPMMCPError("Download stats not found", "DOWNLOADS_NOT_FOUND", 404)
      );

      const result = await tools.getPackageDownloads({
        packageName: "non-existent",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("NPM Error");
      expect(parsed.packageName).toBe("non-existent");
    });

    it("should handle unexpected errors", async () => {
      mockClient.getPackageDownloads.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await tools.getPackageDownloads({
        packageName: "express",
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Unexpected error");
    });

    it("should calculate average per day correctly", async () => {
      mockClient.getPackageDownloads.mockResolvedValue({
        downloads: 700,
        start: "2024-01-01",
        end: "2024-01-07",
        package: "test",
      });

      const result = await tools.getPackageDownloads({ packageName: "test" });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.averagePerDay).toBe(100);
    });
  });

  describe("searchPackages", () => {
    it("should return formatted search results", async () => {
      mockClient.searchPackages.mockResolvedValue({
        objects: [
          {
            package: {
              name: "express",
              version: "4.18.2",
              description: "Fast web framework",
              author: { name: "TJ Holowaychuk" },
              keywords: ["express", "framework"],
              links: { npm: "https://www.npmjs.com/package/express" },
            },
            score: {
              final: 0.95,
              detail: { quality: 0.9, popularity: 0.95, maintenance: 0.98 },
            },
            searchScore: 100000,
          },
          {
            package: {
              name: "fastify",
              version: "4.0.0",
              description: "Fast and low overhead web framework",
              publisher: { username: "fastify", email: "fastify@fastify.io" },
              keywords: ["fastify", "framework"],
              links: { npm: "https://www.npmjs.com/package/fastify" },
            },
            score: {
              final: 0.93,
              detail: { quality: 0.92, popularity: 0.9, maintenance: 0.95 },
            },
            searchScore: 95000,
          },
        ],
        total: 2,
        time: "Wed Jan 01 2024 00:00:00 GMT+0000",
      });

      const result = await tools.searchPackages({
        query: "web framework",
        size: 20,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.query).toBe("web framework");
      expect(parsed.total).toBe(2);
      expect(parsed.returned).toBe(2);
      expect(parsed.packages).toHaveLength(2);
      expect(parsed.packages[0].name).toBe("express");
      expect(parsed.packages[0].score.final).toBe(0.95);
      expect(parsed.packages[0].author).toBe("TJ Holowaychuk");
      expect(parsed.packages[1].author).toBe("fastify");
    });

    it("should handle packages without author or publisher", async () => {
      mockClient.searchPackages.mockResolvedValue({
        objects: [
          {
            package: {
              name: "test",
              version: "1.0.0",
              description: "Test package",
              links: {},
            },
            score: {
              final: 0.5,
              detail: { quality: 0.5, popularity: 0.5, maintenance: 0.5 },
            },
            searchScore: 50000,
          },
        ],
        total: 1,
        time: "Wed Jan 01 2024 00:00:00 GMT+0000",
      });

      const result = await tools.searchPackages({ query: "test", size: 20 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.packages[0].author).toBeUndefined();
    });

    it("should return error result when search fails", async () => {
      mockClient.searchPackages.mockRejectedValue(
        new NPMMCPError("Search failed", "SEARCH_ERROR", 500)
      );

      const result = await tools.searchPackages({ query: "test", size: 20 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("NPM Error");
      expect(parsed.query).toBe("test");
    });

    it("should handle unexpected errors", async () => {
      mockClient.searchPackages.mockRejectedValue(
        new Error("Unexpected error")
      );

      const result = await tools.searchPackages({ query: "test", size: 20 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Unexpected error");
    });

    it("should handle empty search results", async () => {
      mockClient.searchPackages.mockResolvedValue({
        objects: [],
        total: 0,
        time: "Wed Jan 01 2024 00:00:00 GMT+0000",
      });

      const result = await tools.searchPackages({
        query: "nonexistentthingthatdoesntexist",
        size: 20,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.total).toBe(0);
      expect(parsed.returned).toBe(0);
      expect(parsed.packages).toEqual([]);
    });
  });
});
