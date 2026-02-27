import { describe, it, expect } from "vitest";
import { TranscriptionMCPError } from "./types.js";

describe("TranscriptionMCPError", () => {
  it("should create error with code", () => {
    const error = new TranscriptionMCPError("test error", "TEST_CODE");
    expect(error.message).toBe("test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("TranscriptionMCPError");
  });
});
