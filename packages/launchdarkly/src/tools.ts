import { LaunchDarklyClient } from "./launchdarkly-client.js";
import {
  LaunchDarklyConfig,
  ListFlagsParams,
  GetFlagParams,
  ToggleFlagParams,
  CreateFlagParams,
  SearchFlagsParams,
  ListEnvironmentsParams,
  GetFlagStatusesParams,
  AddFlagRuleParams,
  UpdateFlagTargetingParams,
  DeleteFlagParams,
  ListSegmentsParams,
  GetSegmentParams,
  McpToolResult,
  LaunchDarklyMCPError,
} from "./types.js";

export class LaunchDarklyMCPTools {
  constructor(
    private client: LaunchDarklyClient,
    private config: LaunchDarklyConfig
  ) {}

  private resolveProject(projectKey?: string): string {
    return projectKey || this.config.defaultProject;
  }

  private resolveEnvironment(env?: string): string {
    return env || this.config.defaultEnvironment;
  }

  private errorResult(
    error: unknown,
    context: Record<string, unknown>
  ): McpToolResult {
    const errorMessage =
      error instanceof LaunchDarklyMCPError
        ? `LaunchDarkly Error [${error.code}]: ${error.message}`
        : `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage, ...context }, null, 2),
        },
      ],
    };
  }

  private successResult(data: unknown): McpToolResult {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async listFlags(params: ListFlagsParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const result = await this.client.listFlags(projectKey, {
        env,
        limit: params.limit,
        offset: params.offset,
        filter: params.filter || "state:alive",
        sort: params.sort,
      });

      return this.successResult({
        project: projectKey,
        environment: env,
        totalCount: result.totalCount,
        returned: result.items?.length ?? 0,
        offset: params.offset,
        flags: result.items,
      });
    } catch (error) {
      return this.errorResult(error, { projectKey, environment: env });
    }
  }

  async getFlag(params: GetFlagParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const flag = await this.client.getFlag(
        projectKey,
        params.flagKey,
        env
      );

      return this.successResult({
        project: projectKey,
        environment: env,
        flag,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKey: params.flagKey,
        environment: env,
      });
    }
  }

  async toggleFlag(params: ToggleFlagParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const flag = await this.client.toggleFlag(
        projectKey,
        params.flagKey,
        env,
        params.state
      );

      return this.successResult({
        success: true,
        flagKey: params.flagKey,
        environment: env,
        state: params.state,
        message: `Flag "${params.flagKey}" is now ${params.state ? "ON" : "OFF"} in ${env}`,
        flag,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKey: params.flagKey,
        environment: env,
        requestedState: params.state,
      });
    }
  }

  async createFlag(params: CreateFlagParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);

    try {
      const flag = await this.client.createFlag(projectKey, {
        name: params.name,
        key: params.key,
        description: params.description,
        tags: params.tags,
        temporary: params.temporary,
      });

      return this.successResult({
        success: true,
        project: projectKey,
        message: `Flag "${params.name}" (${params.key}) created successfully`,
        flag,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagName: params.name,
        flagKey: params.key,
      });
    }
  }

  async searchFlags(params: SearchFlagsParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const result = await this.client.listFlags(projectKey, {
        env,
        limit: params.limit,
        filter: `query:${params.query}`,
      });

      return this.successResult({
        project: projectKey,
        environment: env,
        query: params.query,
        totalCount: result.totalCount,
        returned: result.items?.length ?? 0,
        flags: result.items,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        environment: env,
        query: params.query,
      });
    }
  }

  async listProjects(): Promise<McpToolResult> {
    try {
      const result = await this.client.listProjects();

      return this.successResult({
        totalCount: result.totalCount,
        projects: result.items,
      });
    } catch (error) {
      return this.errorResult(error, {});
    }
  }

  async listEnvironments(
    params: ListEnvironmentsParams
  ): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);

    try {
      const result = await this.client.listEnvironments(projectKey);

      return this.successResult({
        project: projectKey,
        environments: result.items,
      });
    } catch (error) {
      return this.errorResult(error, { projectKey });
    }
  }

  async getFlagStatuses(
    params: GetFlagStatusesParams
  ): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const envKeys =
      params.environmentKeys || [this.config.defaultEnvironment];

    try {
      const result = await this.client.getFlagStatuses(
        projectKey,
        params.flagKeys,
        envKeys
      );

      return this.successResult({
        project: projectKey,
        environmentKeys: envKeys,
        statuses: result,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKeys: params.flagKeys,
        environmentKeys: envKeys,
      });
    }
  }

  async addFlagRule(params: AddFlagRuleParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const flag = await this.client.getFlag(projectKey, params.flagKey, env);
      const variations = flag.variations as Array<{ _id: string; value: unknown }> | undefined;

      if (!variations || params.variationIndex >= variations.length) {
        return this.errorResult(
          new LaunchDarklyMCPError(
            `Invalid variationIndex ${params.variationIndex}. Flag has ${variations?.length ?? 0} variations.`,
            "INVALID_VARIATION"
          ),
          { projectKey, flagKey: params.flagKey, environment: env }
        );
      }

      const variationId = variations[params.variationIndex]._id;
      const ruleId = crypto.randomUUID();

      const instruction: Record<string, unknown> = {
        kind: "addRule",
        ruleId,
        ref: ruleId,
        _key: ruleId,
        description: params.description,
        trackEvents: false,
        disabled: false,
        clauses: params.clauses.map((c) => ({
          _key: crypto.randomUUID(),
          _id: "",
          attribute: c.attribute,
          op: c.op,
          contextKind: c.contextKind,
          values: c.values,
          negate: c.negate,
        })),
        variationId,
      };

      const result = await this.client.updateFlagTargeting(
        projectKey,
        params.flagKey,
        env,
        [instruction],
        params.comment
      );

      return this.successResult({
        success: true,
        flagKey: params.flagKey,
        environment: env,
        ruleId,
        message: `Targeting rule added to flag "${params.flagKey}" in ${env}`,
        flag: result,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKey: params.flagKey,
        environment: env,
      });
    }
  }

  async updateFlagTargeting(
    params: UpdateFlagTargetingParams
  ): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const result = await this.client.updateFlagTargeting(
        projectKey,
        params.flagKey,
        env,
        params.instructions as Record<string, unknown>[],
        params.comment
      );

      return this.successResult({
        success: true,
        flagKey: params.flagKey,
        environment: env,
        message: `Flag "${params.flagKey}" targeting updated in ${env}`,
        flag: result,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKey: params.flagKey,
        environment: env,
      });
    }
  }

  async deleteFlag(params: DeleteFlagParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);

    try {
      await this.client.deleteFlag(projectKey, params.flagKey);

      return this.successResult({
        success: true,
        flagKey: params.flagKey,
        project: projectKey,
        message: `Flag "${params.flagKey}" deleted from project "${projectKey}"`,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        flagKey: params.flagKey,
      });
    }
  }

  async listSegments(params: ListSegmentsParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const result = await this.client.listSegments(projectKey, env, {
        limit: params.limit,
        offset: params.offset,
      });

      return this.successResult({
        project: projectKey,
        environment: env,
        totalCount: result.totalCount,
        returned: result.items?.length ?? 0,
        offset: params.offset,
        segments: result.items?.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
          tags: s.tags,
          rules: (s.rules as unknown[])?.length ?? 0,
          included: (s.included as unknown[])?.length ?? 0,
          excluded: (s.excluded as unknown[])?.length ?? 0,
          creationDate: s.creationDate,
        })),
      });
    } catch (error) {
      return this.errorResult(error, { projectKey, environment: env });
    }
  }

  async getSegment(params: GetSegmentParams): Promise<McpToolResult> {
    const projectKey = this.resolveProject(params.projectKey);
    const env = this.resolveEnvironment(params.environment);

    try {
      const segment = await this.client.getSegment(
        projectKey,
        env,
        params.segmentKey
      );

      return this.successResult({
        project: projectKey,
        environment: env,
        segment,
      });
    } catch (error) {
      return this.errorResult(error, {
        projectKey,
        environment: env,
        segmentKey: params.segmentKey,
      });
    }
  }
}
