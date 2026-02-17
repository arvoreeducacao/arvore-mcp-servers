import { describe, it, expect, vi, beforeEach } from "vitest";
import { LaunchDarklyClient } from "./launchdarkly-client.js";
import { LaunchDarklyMCPError } from "./types.js";

const mockConfig = {
  email: "test@example.com",
  password: "test-password",
  baseUrl: "https://app.launchdarkly.com",
  defaultProject: "default",
  defaultEnvironment: "production",
};

function createMockResponse(
  status: number,
  body: unknown,
  setCookies: string[] = []
) {
  const headers = new Headers();
  setCookies.forEach((c) => headers.append("Set-Cookie", c));

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("LaunchDarklyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("authenticate", () => {
    it("should complete two-step login and store cookies", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy
        .mockResolvedValueOnce(
          createMockResponse(201, { token: "step1" }, [
            "ldso=session-value; Path=/",
            "pa_ldso=pa-value; Path=/",
          ])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, { success: true }, [
            "ob_ldso=ob-value; Path=/",
          ])
        );

      await client.authenticate();

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall[0]).toBe(
        "https://app.launchdarkly.com/internal/account/login"
      );
      expect(firstCall[1]?.method).toBe("POST");

      const secondCall = fetchSpy.mock.calls[1];
      expect(secondCall[0]).toBe(
        "https://app.launchdarkly.com/internal/account/login2"
      );
      expect(secondCall[1]?.method).toBe("PUT");

      const step2Headers = secondCall[1]?.headers as Record<string, string>;
      expect(step2Headers.Cookie).toContain("ldso=session-value");
      expect(step2Headers.Cookie).toContain("pa_ldso=pa-value");
    });

    it("should throw on login step 1 failure", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(401, { error: "invalid credentials" })
      );

      await expect(client.authenticate()).rejects.toThrow(
        LaunchDarklyMCPError
      );
    });

    it("should throw on login step 2 failure", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          createMockResponse(201, {}, ["ldso=val; Path=/"])
        )
        .mockResolvedValueOnce(createMockResponse(403, { error: "forbidden" }));

      await expect(client.authenticate()).rejects.toThrow(
        LaunchDarklyMCPError
      );
    });

    it("should throw if no session cookies received", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(createMockResponse(201, {}, []))
        .mockResolvedValueOnce(createMockResponse(200, {}, []));

      await expect(client.authenticate()).rejects.toThrow("No session cookies");
    });
  });

  describe("API requests", () => {
    async function createAuthenticatedClient() {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          createMockResponse(201, {}, ["ldso=session; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, {}, ["pa_ldso=pa; Path=/"])
        );

      await client.authenticate();
      vi.restoreAllMocks();
      return client;
    }

    it("should list flags with correct URL and cookies", async () => {
      const client = await createAuthenticatedClient();

      const mockFlags = { items: [{ key: "flag-1" }], totalCount: 1 };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, mockFlags)
      );

      const result = await client.listFlags("default", {
        env: "production",
        limit: 10,
      });

      expect(result.totalCount).toBe(1);
      expect(result.items).toHaveLength(1);

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/internal/flags/default");
      expect(url).toContain("env=production");
      expect(url).toContain("limit=10");
    });

    it("should get flag with environment param", async () => {
      const client = await createAuthenticatedClient();

      const mockFlag = { key: "my-flag", name: "My Flag" };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, mockFlag)
      );

      const result = await client.getFlag("default", "my-flag", "test");

      expect(result.key).toBe("my-flag");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/v2/flags/default/my-flag");
      expect(url).toContain("env=test");
    });

    it("should toggle flag with semantic patch", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, { key: "flag", environments: {} })
      );

      await client.toggleFlag("default", "my-flag", "production", true);

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain("/api/v2/flags/default/my-flag");
      expect(options?.method).toBe("PATCH");

      const headers = options?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toContain("semanticpatch");

      const body = JSON.parse(options?.body as string);
      expect(body.instructions[0].kind).toBe("turnFlagOn");
      expect(body.environmentKey).toBe("production");
    });

    it("should toggle flag OFF", async () => {
      const client = await createAuthenticatedClient();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, { key: "flag" })
      );

      await client.toggleFlag("default", "my-flag", "production", false);

      const body = JSON.parse(
        vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string
      );
      expect(body.instructions[0].kind).toBe("turnFlagOff");
    });

    it("should create flag with correct payload", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(201, { key: "new-flag" })
      );

      await client.createFlag("default", {
        name: "New Flag",
        key: "new-flag",
        description: "A test flag",
        tags: ["test"],
        temporary: true,
      });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain("/api/v2/flags/default");
      expect(options?.method).toBe("POST");

      const body = JSON.parse(options?.body as string);
      expect(body.name).toBe("New Flag");
      expect(body.key).toBe("new-flag");
      expect(body.temporary).toBe(true);
      expect(body.variations).toHaveLength(2);
    });

    it("should delete flag with correct method", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(204, null)
      );

      await client.deleteFlag("default", "old-flag");

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain("/api/v2/flags/default/old-flag");
      expect(options?.method).toBe("DELETE");
    });

    it("should list segments with correct URL", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, { items: [], totalCount: 0 })
      );

      await client.listSegments("default", "production", { limit: 5 });

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("/api/v2/segments/default/production");
      expect(url).toContain("limit=5");
    });

    it("should get segment detail", async () => {
      const client = await createAuthenticatedClient();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, { key: "my-segment", rules: [] })
      );

      const result = await client.getSegment(
        "default",
        "production",
        "my-segment"
      );
      expect(result.key).toBe("my-segment");
    });

    it("should re-authenticate on 401", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(createMockResponse(401, { error: "expired" }))
        .mockResolvedValueOnce(
          createMockResponse(201, {}, ["ldso=new-session; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, {}, ["pa_ldso=new-pa; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, { items: [], totalCount: 0 })
        );

      const result = await client.listProjects();

      expect(result.totalCount).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("should throw on non-401 API error", async () => {
      const client = await createAuthenticatedClient();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(500, { error: "internal server error" })
      );

      await expect(client.listProjects()).rejects.toThrow(
        LaunchDarklyMCPError
      );
    });

    it("should send semantic patch for updateFlagTargeting", async () => {
      const client = await createAuthenticatedClient();

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        createMockResponse(200, { key: "flag" })
      );

      await client.updateFlagTargeting("default", "my-flag", "production", [
        { kind: "turnFlagOn" },
      ]);

      const headers = fetchSpy.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(headers["Content-Type"]).toContain("semanticpatch");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful API call", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          createMockResponse(201, {}, ["ldso=s; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, {}, ["pa_ldso=p; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, { items: [] })
        );

      await client.authenticate();
      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it("should return false on failed API call", async () => {
      const client = new LaunchDarklyClient(mockConfig);

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          createMockResponse(201, {}, ["ldso=s; Path=/"])
        )
        .mockResolvedValueOnce(
          createMockResponse(200, {}, ["pa_ldso=p; Path=/"])
        )
        .mockResolvedValueOnce(createMockResponse(500, {}))
        .mockResolvedValueOnce(createMockResponse(500, {}));

      await client.authenticate();
      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });
});
