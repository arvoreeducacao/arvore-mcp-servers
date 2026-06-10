import { describe, it, expect, vi, beforeEach } from "vitest";
import { HubSpotMCPTools } from "./tools.js";
import { HubSpotClient } from "./hubspot-client.js";

vi.mock("./hubspot-client.js");

describe("HubSpotMCPTools", () => {
  let tools: HubSpotMCPTools;
  let client: HubSpotClient;

  beforeEach(() => {
    client = new HubSpotClient("fake-token");
    client.request = vi.fn();
    tools = new HubSpotMCPTools(client);
  });

  describe("listObjects", () => {
    it("should call GET /crm/v3/objects/:type with query params", async () => {
      const mockData = { results: [], paging: {} };
      vi.mocked(client.request).mockResolvedValue(mockData);

      const result = await tools.listObjects({
        objectType: "contacts",
        limit: 10,
        archived: false,
        properties: ["email", "firstname"],
      });

      expect(client.request).toHaveBeenCalledWith("GET", "/crm/v3/objects/contacts", undefined, {
        limit: "10",
        archived: "false",
        properties: ["email", "firstname"],
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(client.request).mockRejectedValue(new Error("Network error"));

      const result = await tools.listObjects({ objectType: "deals", limit: 20, archived: false });

      expect(JSON.parse(result.content[0].text).error).toContain("Network error");
    });
  });

  describe("getObject", () => {
    it("should call GET /crm/v3/objects/:type/:id", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "1" });

      await tools.getObject({ objectType: "companies", objectId: "1", archived: false });

      expect(client.request).toHaveBeenCalledWith("GET", "/crm/v3/objects/companies/1", undefined, {
        archived: "false",
      });
    });

    it("should pass idProperty when provided", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.getObject({
        objectType: "contacts",
        objectId: "a@b.com",
        idProperty: "email",
        archived: false,
      });

      expect(client.request).toHaveBeenCalledWith("GET", "/crm/v3/objects/contacts/a%40b.com", undefined, {
        archived: "false",
        idProperty: "email",
      });
    });
  });

  describe("createObject", () => {
    it("should call POST with properties only", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "new" });

      await tools.createObject({ objectType: "deals", properties: { dealname: "Big deal" } });

      expect(client.request).toHaveBeenCalledWith("POST", "/crm/v3/objects/deals", {
        properties: { dealname: "Big deal" },
      });
    });

    it("should map associations into HubSpot shape", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.createObject({
        objectType: "notes",
        properties: { hs_note_body: "hi" },
        associations: [{ toObjectId: "501", associationTypeId: 202, associationCategory: "HUBSPOT_DEFINED" }],
      });

      expect(client.request).toHaveBeenCalledWith("POST", "/crm/v3/objects/notes", {
        properties: { hs_note_body: "hi" },
        associations: [
          {
            to: { id: "501" },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
          },
        ],
      });
    });
  });

  describe("updateObject", () => {
    it("should call PATCH /crm/v3/objects/:type/:id", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.updateObject({
        objectType: "tickets",
        objectId: "9",
        properties: { subject: "Updated" },
      });

      expect(client.request).toHaveBeenCalledWith(
        "PATCH",
        "/crm/v3/objects/tickets/9",
        { properties: { subject: "Updated" } },
        {}
      );
    });
  });

  describe("deleteObject", () => {
    it("should call DELETE and return success", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      const result = await tools.deleteObject({ objectType: "contacts", objectId: "5" });

      expect(client.request).toHaveBeenCalledWith("DELETE", "/crm/v3/objects/contacts/5");
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });
  });

  describe("searchObjects", () => {
    it("should POST /search with filterGroups and limit", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.searchObjects({
        objectType: "contacts",
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: "a@b.com" }] }],
        limit: 50,
      });

      expect(client.request).toHaveBeenCalledWith("POST", "/crm/v3/objects/contacts/search", {
        limit: 50,
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: "a@b.com" }] }],
      });
    });
  });

  describe("batchReadObjects", () => {
    it("should POST /batch/read with inputs", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.batchReadObjects({ objectType: "deals", ids: ["1", "2"], properties: ["amount"] });

      expect(client.request).toHaveBeenCalledWith("POST", "/crm/v3/objects/deals/batch/read", {
        inputs: [{ id: "1" }, { id: "2" }],
        properties: ["amount"],
      });
    });
  });

  describe("listAssociations", () => {
    it("should GET v4 associations", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.listAssociations({
        fromObjectType: "contacts",
        fromObjectId: "1",
        toObjectType: "companies",
        limit: 100,
      });

      expect(client.request).toHaveBeenCalledWith(
        "GET",
        "/crm/v4/objects/contacts/1/associations/companies",
        undefined,
        { limit: "100" }
      );
    });
  });

  describe("createAssociation", () => {
    it("should PUT default association when no types", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.createAssociation({
        fromObjectType: "contacts",
        fromObjectId: "1",
        toObjectType: "companies",
        toObjectId: "2",
      });

      expect(client.request).toHaveBeenCalledWith(
        "PUT",
        "/crm/v4/objects/contacts/1/associations/default/companies/2"
      );
    });

    it("should PUT labeled association with types", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.createAssociation({
        fromObjectType: "deals",
        fromObjectId: "1",
        toObjectType: "contacts",
        toObjectId: "2",
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }],
      });

      expect(client.request).toHaveBeenCalledWith(
        "PUT",
        "/crm/v4/objects/deals/1/associations/contacts/2",
        [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }]
      );
    });
  });

  describe("deleteAssociation", () => {
    it("should DELETE association and return success", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      const result = await tools.deleteAssociation({
        fromObjectType: "contacts",
        fromObjectId: "1",
        toObjectType: "companies",
        toObjectId: "2",
      });

      expect(client.request).toHaveBeenCalledWith(
        "DELETE",
        "/crm/v4/objects/contacts/1/associations/companies/2"
      );
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });
  });

  describe("listPipelines", () => {
    it("should GET pipelines for object type", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.listPipelines({ objectType: "deals" });

      expect(client.request).toHaveBeenCalledWith("GET", "/crm/v3/pipelines/deals");
    });
  });

  describe("listProperties", () => {
    it("should GET properties for object type", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.listProperties({ objectType: "contacts", archived: false });

      expect(client.request).toHaveBeenCalledWith("GET", "/crm/v3/properties/contacts", undefined, {
        archived: "false",
      });
    });
  });

  describe("listThreads", () => {
    it("should GET conversation threads with filters", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.listThreads({ limit: 20, inboxId: "42", threadStatus: "OPEN" });

      expect(client.request).toHaveBeenCalledWith(
        "GET",
        "/conversations/v3/conversations/threads",
        undefined,
        { limit: "20", inboxId: "42", threadStatus: "OPEN" }
      );
    });
  });

  describe("listThreadMessages", () => {
    it("should GET thread messages", async () => {
      vi.mocked(client.request).mockResolvedValue({ results: [] });

      await tools.listThreadMessages({ threadId: "100", limit: 20 });

      expect(client.request).toHaveBeenCalledWith(
        "GET",
        "/conversations/v3/conversations/threads/100/messages",
        undefined,
        { limit: "20" }
      );
    });
  });

  describe("sendThreadMessage", () => {
    it("should POST a message with channel info", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "m1" });

      await tools.sendThreadMessage({
        threadId: "100",
        text: "Hello",
        senderActorId: "A-123",
        channelId: "1000",
        channelAccountId: "2000",
      });

      expect(client.request).toHaveBeenCalledWith(
        "POST",
        "/conversations/v3/conversations/threads/100/messages",
        {
          type: "MESSAGE",
          text: "Hello",
          richText: "Hello",
          senderActorId: "A-123",
          channelId: "1000",
          channelAccountId: "2000",
        }
      );
    });
  });

  describe("updateThread", () => {
    it("should PATCH thread status", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.updateThread({ threadId: "100", status: "CLOSED" });

      expect(client.request).toHaveBeenCalledWith(
        "PATCH",
        "/conversations/v3/conversations/threads/100",
        { status: "CLOSED" }
      );
    });
  });
});
