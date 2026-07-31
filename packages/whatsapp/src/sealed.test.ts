import { describe, expect, it } from "vitest";
import { seal, unseal } from "./sealed.js";
import { sessionSlug } from "./paths.js";

const SECRET = "token-with-at-least-16-chars";

describe("seal/unseal", () => {
  it("round-trips a payload", () => {
    const sealed = seal({ key: "ada.lovelace_example.com", expiresAt: 123 }, SECRET, "qr");
    expect(unseal(sealed, SECRET, "qr")).toEqual({
      key: "ada.lovelace_example.com",
      expiresAt: 123,
    });
  });

  it("rejects another secret", () => {
    const sealed = seal({ key: "a" }, SECRET, "qr");
    expect(unseal(sealed, "another-secret-16-chars", "qr")).toBeNull();
  });

  it("rejects another context", () => {
    const sealed = seal({ key: "a" }, SECRET, "qr");
    expect(unseal(sealed, SECRET, "token")).toBeNull();
  });

  it("rejects tampered payloads", () => {
    const sealed = seal({ key: "a" }, SECRET, "qr");
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    expect(unseal(tampered, SECRET, "qr")).toBeNull();
  });

  it("rejects garbage", () => {
    expect(unseal("", SECRET, "qr")).toBeNull();
    expect(unseal("not-base64url!!", SECRET, "qr")).toBeNull();
  });
});

describe("sessionSlug", () => {
  it("keeps one directory per identity", () => {
    expect(sessionSlug("Ada.Lovelace@example.com")).toBe("ada.lovelace_example.com");
    expect(sessionSlug(" ada.lovelace@example.com ")).toBe("ada.lovelace_example.com");
  });

  it("strips path traversal", () => {
    expect(sessionSlug("../../etc/passwd")).toBe(".._.._etc_passwd");
  });
});
