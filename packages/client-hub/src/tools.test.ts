import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientHubMCPTools } from "./tools.js";
import { ClientHubMCPError } from "./types.js";

describe("ClientHubMCPTools", () => {
  const api = { request: vi.fn() };
  const tools = new ClientHubMCPTools(api as never);

  beforeEach(() => {
    api.request.mockReset();
  });

  it("returns friendly error result on UNREACHABLE (isError)", async () => {
    api.request.mockRejectedValue(
      new ClientHubMCPError("Client Hub API unreachable", "UNREACHABLE")
    );

    const res = await tools.searchClient({ query: "escola" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Could not reach the Client Hub/);
  });

  it("returns friendly error result on TIMEOUT", async () => {
    api.request.mockRejectedValue(
      new ClientHubMCPError("Client Hub API timed out after 30000ms", "TIMEOUT")
    );

    const res = await tools.searchConversations({ clientId: 1, query: "x" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/took too long/);
  });

  it("does not leak unexpected error details", async () => {
    api.request.mockRejectedValue(new Error("secret internal detail"));

    const res = await tools.listLinks({ clientId: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toMatch(/secret internal detail/);
  });

  it("treats empty object 360 as found:false", async () => {
    api.request.mockResolvedValue({});
    const res = await tools.getClient360({ clientId: 1 });
    const body = JSON.parse(res.content[0].text);
    expect(body.found).toBe(false);
  });

  it("treats empty array 360 as found:false", async () => {
    api.request.mockResolvedValue([]);
    const res = await tools.getClient360({ clientId: 1 });
    const body = JSON.parse(res.content[0].text);
    expect(body.found).toBe(false);
  });

  it("returns 360 data when present", async () => {
    api.request.mockResolvedValue({ client_id: "1", deal_status: "won" });
    const res = await tools.getClient360({ clientId: 1 });
    const body = JSON.parse(res.content[0].text);
    expect(body.deal_status).toBe("won");
    expect(res.isError).toBeUndefined();
  });
});
