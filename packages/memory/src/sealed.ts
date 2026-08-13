import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function seal<T>(payload: T, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, context), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(value: string, secret: string, context: string): T | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret, context),
      raw.subarray(0, 12)
    );
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(plain.toString("utf-8")) as T;
  } catch {
    return null;
  }
}

function deriveKey(secret: string, context: string): Buffer {
  return createHash("sha256").update(`${secret}:${context}`).digest();
}
