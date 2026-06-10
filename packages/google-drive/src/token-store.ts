import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { OAuthCredentials, GoogleDriveMCPError } from "./types.js";

const KEYCHAIN_SERVICE = "arvoretech-google-drive-mcp";
const KEYCHAIN_ACCOUNT = "encryption-key";
const ALGORITHM = "aes-256-gcm";

export class TokenStore {
  private configDir: string;
  private credentialsPath: string;
  private keyFallbackPath: string;

  constructor(configDir?: string) {
    this.configDir =
      configDir ||
      process.env.GDRIVE_MCP_CONFIG_DIR ||
      join(homedir(), ".config", "arvoretech-google-drive-mcp");
    this.credentialsPath = join(this.configDir, "credentials.enc");
    this.keyFallbackPath = join(this.configDir, ".encryption_key");
  }

  async save(credentials: OAuthCredentials): Promise<void> {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });

    const key = await this.getOrCreateKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(credentials);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf-8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const payload = {
      version: 1,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      data: encrypted.toString("base64"),
    };

    await writeFile(this.credentialsPath, JSON.stringify(payload), {
      mode: 0o600,
    });
  }

  async load(): Promise<OAuthCredentials | null> {
    if (!existsSync(this.credentialsPath)) {
      return null;
    }

    const raw = await readFile(this.credentialsPath, "utf-8");
    const payload = JSON.parse(raw) as {
      version: number;
      iv: string;
      authTag: string;
      data: string;
    };

    const key = await this.loadKey();
    if (!key) {
      throw new GoogleDriveMCPError(
        "Encryption key missing — credentials file exists but key cannot be loaded. Re-run `google-drive-mcp auth login` to recreate.",
        "AUTH_ERROR"
      );
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

    try {
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.data, "base64")),
        decipher.final(),
      ]);
      return JSON.parse(decrypted.toString("utf-8")) as OAuthCredentials;
    } catch (error) {
      throw new GoogleDriveMCPError(
        `Failed to decrypt credentials: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
        "AUTH_ERROR"
      );
    }
  }

  async clear(): Promise<void> {
    if (existsSync(this.credentialsPath)) {
      await writeFile(this.credentialsPath, "");
    }
  }

  private async getOrCreateKey(): Promise<Buffer> {
    const existing = await this.loadKey();
    if (existing) return existing;

    const key = randomBytes(32);
    await this.persistKey(key);
    return key;
  }

  private async loadKey(): Promise<Buffer | null> {
    const fromKeychain = await this.readFromKeychain();
    if (fromKeychain) {
      return Buffer.from(fromKeychain, "base64");
    }

    if (existsSync(this.keyFallbackPath)) {
      const raw = await readFile(this.keyFallbackPath, "utf-8");
      return Buffer.from(raw.trim(), "base64");
    }

    return null;
  }

  private async persistKey(key: Buffer): Promise<void> {
    const encoded = key.toString("base64");

    const written = await this.writeToKeychain(encoded);
    if (written) return;

    await mkdir(dirname(this.keyFallbackPath), { recursive: true, mode: 0o700 });
    await writeFile(this.keyFallbackPath, encoded, { mode: 0o600 });
    await chmod(this.keyFallbackPath, 0o600);
  }

  private async readFromKeychain(): Promise<string | null> {
    if (process.platform !== "darwin") return null;

    return new Promise((resolve) => {
      const child = spawn("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ]);

      let stdout = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          resolve(null);
        }
      });

      child.on("error", () => resolve(null));
    });
  }

  private async writeToKeychain(value: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;

    return new Promise((resolve) => {
      const child = spawn("security", [
        "add-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
        value,
        "-U",
      ]);

      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
  }
}
