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
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "exchanged-legacy-token",
              expires_in: 3600,
              token_type: "Bearer",
              issued_token_type:
                "urn:ietf:params:oauth:token-type:access_token",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(okResponse({ data: [] }));

      await client.request("GET", "clients", undefined, "user-identity-token");

      const [, init] = fetchMock.mock.calls[1];
      expect(init.headers.authorization).toBe("Bearer exchanged-legacy-token");
    });

    it("caches the exchanged legacy token for subsequent requests", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "cached-legacy-token",
              expires_in: 3600,
              token_type: "Bearer",
              issued_token_type:
                "urn:ietf:params:oauth:token-type:access_token",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
        .mockResolvedValue(okResponse({ data: [] }));

      await client.request("GET", "clients", undefined, "user-identity-token");
      await client.request("GET", "clients", undefined, "user-identity-token");

      const exchangeCalls = fetchMock.mock.calls.filter(([url]) =>
        (url as string).includes("token/exchange")
      );
      expect(exchangeCalls).toHaveLength(1);
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

  describe("retry", () => {
    const makeClient = () =>
      new ClientHubApiClient({
        apiBaseUrl: "https://api.test",
        apiToken: "secret-token",
        requestTimeout: 1000,
        maxRetries: 2,
        retryBaseDelay: 0,
      });

    it("retries transient network errors and succeeds", async () => {
      const retryClient = makeClient();
      fetchMock
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce(okResponse({ data: [1] }));

      await expect(retryClient.request("GET", "clients")).resolves.toEqual({
        data: [1],
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("gives up after maxRetries + 1 attempts on persistent failure", async () => {
      const retryClient = makeClient();
      fetchMock.mockRejectedValue(new Error("down"));

      await expect(retryClient.request("GET", "clients")).rejects.toMatchObject(
        { code: "UNREACHABLE" }
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("retries 5xx responses but not 4xx", async () => {
      const retryClient = makeClient();
      const errorResponse = (status: number) => ({
        ok: false,
        status,
        text: async () => "err",
        json: async () => ({}),
      });

      fetchMock.mockResolvedValue(errorResponse(404));
      await expect(
        retryClient.request("GET", "clients")
      ).rejects.toMatchObject({ code: "API_ERROR" });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockReset();
      fetchMock
        .mockResolvedValueOnce(errorResponse(503))
        .mockResolvedValueOnce(okResponse({ data: [] }));
      await expect(retryClient.request("GET", "clients")).resolves.toEqual({
        data: [],
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
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
