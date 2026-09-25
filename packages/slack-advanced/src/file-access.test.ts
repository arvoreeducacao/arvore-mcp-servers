import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAccessPolicy, parseAllowedDirs } from "./file-access.js";

let root: string;
let home: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "file-access-")));
  home = join(root, "home");
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, "shots"), { recursive: true });
  writeFileSync(join(home, ".ssh", "id_ed25519"), "secret");
  writeFileSync(join(home, "shots", "tela.png"), "png");
  mkdirSync(join(home, ".aws"), { recursive: true });
  writeFileSync(join(home, ".aws", "credentials"), "secret");
  mkdirSync(join(home, ".hive", "shots"), { recursive: true });
  writeFileSync(join(home, ".hive", "key-rafael"), "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n");
  writeFileSync(join(home, ".hive", "shots", "chave.png"), "-----BEGIN RSA PRIVATE KEY-----\nabc\n");
  writeFileSync(join(home, ".hive", "shots", "print.png"), "png");
  symlinkSync(join(home, ".ssh", "id_ed25519"), join(home, "shots", "innocent.png"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("FileAccessPolicy without an allowlist", () => {
  const policy = () => new FileAccessPolicy([], home);

  it("lets an ordinary file through", () => {
    expect(policy().check(join(home, "shots", "tela.png"), "read")).toBe(join(home, "shots", "tela.png"));
  });

  it("blocks credential folders", () => {
    expect(() => policy().check(join(home, ".ssh", "id_ed25519"), "read")).toThrow(/credential/);
  });

  it("blocks a symlink that points into a credential folder", () => {
    expect(() => policy().check(join(home, "shots", "innocent.png"), "read")).toThrow(/credential/);
  });

  it("blocks .env files anywhere", () => {
    expect(() => policy().check(join(home, "project", ".env.local"), "read")).toThrow(/credential/);
  });

  it("blocks writing over system files", () => {
    expect(() => policy().check("/etc/hosts", "write")).toThrow(/credential or system/);
  });

  it("blocks a credential folder written in another case, which macOS opens anyway", () => {
    expect(() => policy().check(join(home, ".AWS", "credentials"), "read")).toThrow(/credential/);
    expect(() => policy().check(join(home, "project", ".ENV"), "read")).toThrow(/credential/);
  });

  it("blocks a private key by its content, whatever the name", () => {
    expect(() => policy().check(join(home, ".hive", "shots", "chave.png"), "read")).toThrow(/private key/);
    expect(() => policy().check(join(home, ".hive", "key-rafael"), "read")).toThrow(/credential|private key/);
  });

  it("still lets the Hive screenshots through", () => {
    expect(policy().check(join(home, ".hive", "shots", "print.png"), "read")).toBe(join(home, ".hive", "shots", "print.png"));
  });

  it("refuses writes that could run code", () => {
    for (const target of [
      join(home, ".zshrc"),
      join(home, "Library", "LaunchAgents", "x.plist"),
      join(home, ".claude", "settings.json"),
      join(home, "repo", ".git", "hooks", "pre-commit"),
    ]) {
      expect(() => policy().check(target, "write")).toThrow();
    }
    expect(policy().check(join(home, "Downloads", "report.pdf"), "write")).toBe(join(home, "Downloads", "report.pdf"));
  });

  it("requires an absolute path", () => {
    expect(() => policy().check("shots/tela.png", "read")).toThrow(/absolute/);
  });
});

describe("FileAccessPolicy with an allowlist", () => {
  it("only allows files under the listed folders", () => {
    const policy = new FileAccessPolicy(parseAllowedDirs(join(home, "shots")), home);

    expect(policy.check(join(home, "shots", "tela.png"), "read")).toBe(join(home, "shots", "tela.png"));
    expect(() => policy.check(join(home, "other.png"), "read")).toThrow(/SLACK_FILE_ALLOWED_DIRS/);
  });

  it("still refuses a private key inside an allowed folder", () => {
    const policy = new FileAccessPolicy(parseAllowedDirs(join(home, ".hive")), home);
    expect(() => policy.check(join(home, ".hive", "shots", "chave.png"), "read")).toThrow(/private key/);
  });

  it("does not treat a sibling with the same prefix as inside", () => {
    const policy = new FileAccessPolicy(parseAllowedDirs(join(home, "shots")), home);
    expect(() => policy.check(join(home, "shots-evil", "x.png"), "read")).toThrow(/SLACK_FILE_ALLOWED_DIRS/);
  });

  it("splits the variable on colon and comma", () => {
    expect(parseAllowedDirs(" /a:/b , /c ").length).toBe(3);
    expect(parseAllowedDirs(undefined)).toEqual([]);
  });
});
