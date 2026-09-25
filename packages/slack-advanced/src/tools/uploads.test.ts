import { describe, it, expect, vi } from "vitest";
import { UploadTools } from "./uploads.js";
import { FileAccessPolicy } from "../file-access.js";
import type { SlackClient } from "../slack-client.js";
import { SlackAdvancedMCPError } from "../types.js";

describe("UploadTools", () => {
  it("turns a failed image upload into an error result instead of an unhandled rejection", async () => {
    const slack = {
      resolveChannelId: vi.fn().mockRejectedValue(new SlackAdvancedMCPError("Could not resolve channel", "CHANNEL_NOT_FOUND")),
    } as unknown as SlackClient;

    const result = await new UploadTools(slack, null).sendImage({
      target: "#nope",
      target_type: "channel",
      file_base64: Buffer.from("png").toString("base64"),
      filename: "x.png",
    });

    expect(result.isError).toBe(true);
  });

  it("refuses to upload a file the policy blocks", async () => {
    const uploadFile = vi.fn();
    const slack = { resolveChannelId: vi.fn().mockResolvedValue("C0123ABCD"), uploadFile } as unknown as SlackClient;
    const policy = new FileAccessPolicy(["/nowhere-allowed"]);

    const result = await new UploadTools(slack, null, policy).sendFile({
      target: "C0123ABCD",
      target_type: "channel",
      file_path: "/etc/hosts",
      filename: "hosts",
    });

    expect(result.isError).toBe(true);
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
