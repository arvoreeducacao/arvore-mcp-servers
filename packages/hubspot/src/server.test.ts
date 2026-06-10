import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HubSpotMCPServer } from "./server.js";

const READ_TOOLS = [
  "list_objects",
  "get_object",
  "search_objects",
  "batch_read_objects",
  "list_associations",
  "list_pipelines",
  "list_properties",
  "list_inboxes",
  "list_threads",
  "get_thread",
  "list_thread_messages",
];

const WRITE_TOOLS = [
  "create_object",
  "update_object",
  "delete_object",
  "create_association",
  "delete_association",
  "send_thread_message",
  "update_thread",
];

function registeredToolNames(server: HubSpotMCPServer): string[] {
  const internal = server as unknown as {
    server: { _registeredTools?: Record<string, unknown> };
  };
  return Object.keys(internal.server._registeredTools ?? {});
}

describe("HubSpotMCPServer read-only mode", () => {
  beforeEach(() => {
    process.env.HUBSPOT_ACCESS_TOKEN = "fake-token";
  });

  afterEach(() => {
    delete process.env.HUBSPOT_READ_ONLY;
    delete process.env.HUBSPOT_ACCESS_TOKEN;
  });

  it("registers only read tools by default", () => {
    delete process.env.HUBSPOT_READ_ONLY;
    const names = registeredToolNames(new HubSpotMCPServer());

    expect(names.sort()).toEqual([...READ_TOOLS].sort());
    for (const w of WRITE_TOOLS) {
      expect(names).not.toContain(w);
    }
  });

  it("keeps read-only when HUBSPOT_READ_ONLY is any non-false value", () => {
    process.env.HUBSPOT_READ_ONLY = "true";
    const names = registeredToolNames(new HubSpotMCPServer());
    expect(names.sort()).toEqual([...READ_TOOLS].sort());
  });

  it("registers write tools when HUBSPOT_READ_ONLY=false", () => {
    process.env.HUBSPOT_READ_ONLY = "false";
    const names = registeredToolNames(new HubSpotMCPServer());

    for (const t of [...READ_TOOLS, ...WRITE_TOOLS]) {
      expect(names).toContain(t);
    }
    expect(names.length).toBe(READ_TOOLS.length + WRITE_TOOLS.length);
  });

  it("throws without an access token", () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    expect(() => new HubSpotMCPServer()).toThrow(/HUBSPOT_ACCESS_TOKEN/);
  });
});
