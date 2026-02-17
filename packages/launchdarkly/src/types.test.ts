import { describe, it, expect } from "vitest";
import {
  LaunchDarklyConfigSchema,
  ListFlagsParamsSchema,
  GetFlagParamsSchema,
  ToggleFlagParamsSchema,
  CreateFlagParamsSchema,
  SearchFlagsParamsSchema,
  AddFlagRuleParamsSchema,
  UpdateFlagTargetingParamsSchema,
  DeleteFlagParamsSchema,
  ListSegmentsParamsSchema,
  GetSegmentParamsSchema,
  GetFlagStatusesParamsSchema,
  LaunchDarklyMCPError,
} from "./types.js";

describe("LaunchDarklyConfigSchema", () => {
  it("should validate a valid config", () => {
    const result = LaunchDarklyConfigSchema.parse({
      email: "user@example.com",
      password: "secret",
    });

    expect(result.email).toBe("user@example.com");
    expect(result.password).toBe("secret");
    expect(result.baseUrl).toBe("https://app.launchdarkly.com");
    expect(result.defaultProject).toBe("default");
    expect(result.defaultEnvironment).toBe("production");
  });

  it("should apply custom values", () => {
    const result = LaunchDarklyConfigSchema.parse({
      email: "user@example.com",
      password: "secret",
      baseUrl: "https://custom.launchdarkly.com",
      defaultProject: "my-project",
      defaultEnvironment: "staging",
    });

    expect(result.baseUrl).toBe("https://custom.launchdarkly.com");
    expect(result.defaultProject).toBe("my-project");
    expect(result.defaultEnvironment).toBe("staging");
  });

  it("should reject invalid email", () => {
    expect(() =>
      LaunchDarklyConfigSchema.parse({
        email: "not-an-email",
        password: "secret",
      })
    ).toThrow();
  });

  it("should reject empty password", () => {
    expect(() =>
      LaunchDarklyConfigSchema.parse({
        email: "user@example.com",
        password: "",
      })
    ).toThrow();
  });

  it("should reject missing email", () => {
    expect(() =>
      LaunchDarklyConfigSchema.parse({
        password: "secret",
      })
    ).toThrow();
  });
});

describe("ListFlagsParamsSchema", () => {
  it("should apply defaults", () => {
    const result = ListFlagsParamsSchema.parse({});

    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
    expect(result.projectKey).toBeUndefined();
    expect(result.environment).toBeUndefined();
  });

  it("should accept valid params", () => {
    const result = ListFlagsParamsSchema.parse({
      projectKey: "my-project",
      environment: "staging",
      limit: 50,
      offset: 10,
      filter: "state:alive",
      sort: "-creationDate",
    });

    expect(result.projectKey).toBe("my-project");
    expect(result.limit).toBe(50);
  });

  it("should reject limit over 50", () => {
    expect(() => ListFlagsParamsSchema.parse({ limit: 100 })).toThrow();
  });

  it("should reject negative offset", () => {
    expect(() => ListFlagsParamsSchema.parse({ offset: -1 })).toThrow();
  });
});

describe("GetFlagParamsSchema", () => {
  it("should require flagKey", () => {
    expect(() => GetFlagParamsSchema.parse({})).toThrow();
  });

  it("should reject empty flagKey", () => {
    expect(() => GetFlagParamsSchema.parse({ flagKey: "" })).toThrow();
  });

  it("should accept valid params", () => {
    const result = GetFlagParamsSchema.parse({
      flagKey: "my-flag",
      environment: "test",
    });

    expect(result.flagKey).toBe("my-flag");
    expect(result.environment).toBe("test");
  });
});

describe("ToggleFlagParamsSchema", () => {
  it("should require flagKey and state", () => {
    expect(() => ToggleFlagParamsSchema.parse({})).toThrow();
    expect(() => ToggleFlagParamsSchema.parse({ flagKey: "x" })).toThrow();
  });

  it("should accept valid toggle", () => {
    const result = ToggleFlagParamsSchema.parse({
      flagKey: "my-flag",
      state: true,
    });

    expect(result.state).toBe(true);
  });
});

describe("CreateFlagParamsSchema", () => {
  it("should require name and key", () => {
    expect(() => CreateFlagParamsSchema.parse({})).toThrow();
  });

  it("should apply defaults", () => {
    const result = CreateFlagParamsSchema.parse({
      name: "My Flag",
      key: "my-flag",
    });

    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
    expect(result.temporary).toBe(true);
  });
});

describe("SearchFlagsParamsSchema", () => {
  it("should require query", () => {
    expect(() => SearchFlagsParamsSchema.parse({})).toThrow();
  });

  it("should apply default limit", () => {
    const result = SearchFlagsParamsSchema.parse({ query: "test" });
    expect(result.limit).toBe(20);
  });
});

describe("AddFlagRuleParamsSchema", () => {
  it("should require flagKey, clauses, and variationIndex", () => {
    expect(() => AddFlagRuleParamsSchema.parse({})).toThrow();
  });

  it("should accept a valid rule with 'in' operator", () => {
    const result = AddFlagRuleParamsSchema.parse({
      flagKey: "my-flag",
      variationIndex: 0,
      clauses: [
        {
          attribute: "email",
          op: "in",
          values: ["user@test.com"],
          contextKind: "user",
        },
      ],
    });

    expect(result.clauses).toHaveLength(1);
    expect(result.clauses[0].op).toBe("in");
  });

  it("should accept segmentMatch with empty attribute", () => {
    const result = AddFlagRuleParamsSchema.parse({
      flagKey: "my-flag",
      variationIndex: 0,
      clauses: [
        {
          attribute: "",
          op: "segmentMatch",
          values: ["beta-segment"],
        },
      ],
    });

    expect(result.clauses[0].attribute).toBe("");
    expect(result.clauses[0].op).toBe("segmentMatch");
  });

  it("should reject invalid operator", () => {
    expect(() =>
      AddFlagRuleParamsSchema.parse({
        flagKey: "my-flag",
        variationIndex: 0,
        clauses: [
          {
            attribute: "email",
            op: "invalidOp",
            values: ["test"],
          },
        ],
      })
    ).toThrow();
  });

  it("should apply defaults for description and comment", () => {
    const result = AddFlagRuleParamsSchema.parse({
      flagKey: "my-flag",
      variationIndex: 0,
      clauses: [{ attribute: "key", op: "in", values: ["a"] }],
    });

    expect(result.description).toBe("");
    expect(result.comment).toBe("");
  });
});

describe("UpdateFlagTargetingParamsSchema", () => {
  it("should require flagKey and instructions", () => {
    expect(() => UpdateFlagTargetingParamsSchema.parse({})).toThrow();
  });

  it("should require at least one instruction", () => {
    expect(() =>
      UpdateFlagTargetingParamsSchema.parse({
        flagKey: "my-flag",
        instructions: [],
      })
    ).toThrow();
  });

  it("should accept arbitrary instruction objects", () => {
    const result = UpdateFlagTargetingParamsSchema.parse({
      flagKey: "my-flag",
      instructions: [
        { kind: "turnFlagOn" },
        { kind: "updateFallthroughVariationOrRollout", variationId: "abc" },
      ],
    });

    expect(result.instructions).toHaveLength(2);
  });
});

describe("DeleteFlagParamsSchema", () => {
  it("should require flagKey", () => {
    expect(() => DeleteFlagParamsSchema.parse({})).toThrow();
  });
});

describe("ListSegmentsParamsSchema", () => {
  it("should apply defaults", () => {
    const result = ListSegmentsParamsSchema.parse({});

    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });
});

describe("GetSegmentParamsSchema", () => {
  it("should require segmentKey", () => {
    expect(() => GetSegmentParamsSchema.parse({})).toThrow();
  });
});

describe("GetFlagStatusesParamsSchema", () => {
  it("should require flagKeys with at least one", () => {
    expect(() => GetFlagStatusesParamsSchema.parse({})).toThrow();
    expect(() =>
      GetFlagStatusesParamsSchema.parse({ flagKeys: [] })
    ).toThrow();
  });

  it("should accept valid params", () => {
    const result = GetFlagStatusesParamsSchema.parse({
      flagKeys: ["flag-a", "flag-b"],
      environmentKeys: ["production"],
    });

    expect(result.flagKeys).toHaveLength(2);
  });
});

describe("LaunchDarklyMCPError", () => {
  it("should create error with code", () => {
    const error = new LaunchDarklyMCPError("test error", "TEST_CODE");

    expect(error.message).toBe("test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("LaunchDarklyMCPError");
    expect(error.statusCode).toBeUndefined();
  });

  it("should create error with status code", () => {
    const error = new LaunchDarklyMCPError("not found", "NOT_FOUND", 404);

    expect(error.statusCode).toBe(404);
  });

  it("should be an instance of Error", () => {
    const error = new LaunchDarklyMCPError("test", "CODE");
    expect(error).toBeInstanceOf(Error);
  });
});
