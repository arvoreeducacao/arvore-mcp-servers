import { NPMClient } from "./npm-client.js";
import {
  PackageInfoParams,
  PackageDownloadsParams,
  PackageSearchParams,
  McpToolResult,
  NPMMCPError,
  PackageInfo,
} from "./types.js";

export class NPMMCPTools {
  constructor(private npmClient: NPMClient) {}

  async getPackageInfo(params: PackageInfoParams): Promise<McpToolResult> {
    try {
      const packageInfo = await this.npmClient.getPackageInfo(
        params.packageName
      );

      const latestVersion =
        packageInfo["dist-tags"]?.latest || packageInfo.version;

      let versionInfo = packageInfo;
      if (
        packageInfo.versions &&
        latestVersion &&
        packageInfo.versions[latestVersion]
      ) {
        versionInfo = packageInfo.versions[latestVersion] as PackageInfo;
      }

      const resultData = {
        name: packageInfo.name,
        version: latestVersion,
        description: versionInfo.description || packageInfo.description,
        homepage: versionInfo.homepage || packageInfo.homepage,
        repository: versionInfo.repository || packageInfo.repository,
        author: versionInfo.author || packageInfo.author,
        license: versionInfo.license || packageInfo.license,
        keywords: versionInfo.keywords || packageInfo.keywords,
        dependencies: versionInfo.dependencies || packageInfo.dependencies,
        devDependencies:
          versionInfo.devDependencies || packageInfo.devDependencies,
        scripts: versionInfo.scripts || packageInfo.scripts,
        maintainers: packageInfo.maintainers,
        created: packageInfo.time?.created,
        modified: packageInfo.time?.modified,
        distTags: packageInfo["dist-tags"],
        availableVersions: Object.keys(packageInfo.versions || {}).slice(-10),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof NPMMCPError
          ? `NPM Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                packageName: params.packageName,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async getPackageDownloads(
    params: PackageDownloadsParams
  ): Promise<McpToolResult> {
    try {
      const downloadStats = await this.npmClient.getPackageDownloads(
        params.packageName
      );

      const resultData = {
        package: downloadStats.package,
        downloads: downloadStats.downloads,
        period: `${downloadStats.start} to ${downloadStats.end}`,
        averagePerDay: Math.round(downloadStats.downloads / 7),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof NPMMCPError
          ? `NPM Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                packageName: params.packageName,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async searchPackages(params: PackageSearchParams): Promise<McpToolResult> {
    try {
      const searchResults = await this.npmClient.searchPackages(
        params.query,
        params.size
      );

      const resultData = {
        query: params.query,
        total: searchResults.total,
        returned: searchResults.objects.length,
        searchTime: searchResults.time,
        packages: searchResults.objects.map((result) => ({
          name: result.package.name,
          version: result.package.version,
          description: result.package.description,
          author:
            result.package.author?.name || result.package.publisher?.username,
          keywords: result.package.keywords,
          links: result.package.links,
          score: {
            final: result.score.final,
            quality: result.score.detail.quality,
            popularity: result.score.detail.popularity,
            maintenance: result.score.detail.maintenance,
          },
          searchScore: result.searchScore,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof NPMMCPError
          ? `NPM Error: ${error.message}`
          : `Unexpected error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: errorMessage,
                query: params.query,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
}
