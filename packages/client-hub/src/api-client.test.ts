import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClientHubApiClient } from "./api-client.js";
import { ClientHubMCPError } from "./types.js";

describe("ClientHubApiClient", () => {
  let client: ClientHubApiClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    client = new ClientHubApiClient({
      apiBaseUrl: "https://api.test",
      apiToken: "secret-token",
      requestTimeout: 1000,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const okResponse = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  describe("request", () => {
    it("builds the url without query when none is provided", async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await client.request("GET", "clients");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.test/clients");
    });

    it("appends and encodes query params, dropping undefined and empty values", async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await client.request("GET", "clients", {
        query: "joão & cia",
        limit: "10",
        skip: undefined,
        source: "",
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://api.test/clients?query=jo%C3%A3o%20%26%20cia&limit=10"
      );
    });

    it("sends the bearer token in the authorization header", async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await client.request("GET", "clients");

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.authorization).toBe("Bearer secret-token");
    });

    it("prefers the per-request auth token over the configured service token", async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await client.request("GET", "clients", undefined, "user-token");

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.authorization).toBe("Bearer user-token");
    });

    it("throws NO_AUTH_TOKEN when neither service nor request token is present", async () => {
      const tokenless = new ClientHubApiClient({
        apiBaseUrl: "https://api.test",
        apiToken: "",
        requestTimeout: 1000,
      });

      await expect(tokenless.request("GET", "clients")).rejects.toMatchObject({
        name: "ClientHubMCPError",
        code: "NO_AUTH_TOKEN",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns the parsed json body on success", async () => {
      fetchMock.mockResolvedValue(okResponse({ id: 1, name: "Escola" }));

      const result = await client.request("GET", "clients/1/360");

      expect(result).toEqual({ id: 1, name: "Escola" });
    });

    it("returns null when the response body is empty", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Unexpected end of JSON input");
        },
        text: async () => "",
      });

      const result = await client.request("GET", "clients/999/360");

      expect(result).toBeNull();
    });

    it("throws INVALID_RESPONSE when the body is not valid json", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("Unexpected token");
        },
        text: async () => "<html>oops</html>",
      });

      await expect(
        client.request("GET", "clients/1/360")
      ).rejects.toMatchObject({
        name: "ClientHubMCPError",
        code: "INVALID_RESPONSE",
      });
    });

    it("throws API_ERROR when the response is not ok", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => "not found",
      });

      await expect(client.request("GET", "clients/999/360")).rejects.toMatchObject(
        {
          name: "ClientHubMCPError",
          code: "API_ERROR",
          detail: "not found",
        }
      );
    });

    it("wraps network errors as UNREACHABLE", async () => {
      fetchMock.mockRejectedValue(new Error("connection refused"));

      await expect(client.request("GET", "clients")).rejects.toMatchObject({
        name: "ClientHubMCPError",
        code: "UNREACHABLE",
        detail: "connection refused",
      });
    });

    it("rethrows ClientHubMCPError without re-wrapping", async () => {
      const original = new ClientHubMCPError("boom", "API_ERROR", "detail");
      fetchMock.mockRejectedValue(original);

      await expect(client.request("GET", "clients")).rejects.toBe(original);
    });
  });

  describe("testConnection", () => {
    it("returns true when the clients endpoint responds ok", async () => {
      fetchMock.mockResolvedValue(okResponse({ data: [] }));

      await expect(client.testConnection()).resolves.toBe(true);
    });

    it("returns false when the request fails", async () => {
      fetchMock.mockRejectedValue(new Error("down"));

      await expect(client.testConnection()).resolves.toBe(false);
    });
  });
});
