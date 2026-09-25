import { closeSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { SlackAdvancedMCPError } from "./types.js";

const SENSITIVE_HOME_PATHS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".config",
  ".azure",
  ".gcloud",
  ".claude",
  ".claude.json",
  ".npmrc",
  ".netrc",
  ".pgpass",
  ".git-credentials",
  ".bash_history",
  ".zsh_history",
  "Library/Keychains",
  "Library/Cookies",
  "Library/Application Support/Google/Chrome",
];

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(rc)?(\..*)?$/i,
  /^id_[a-z0-9]+$/i,
  /^key-/i,
  /\.(pem|key|p8|p12|pfx|jks|keystore)$/i,
];

const SENSITIVE_SYSTEM_DIRS = ["/etc", "/private/etc", "/var/root", "/root"];

const EXECUTABLE_WRITE_TARGETS = ["Library/LaunchAgents", "Library/LaunchDaemons"];

const PRIVATE_KEY_MARKER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

const SNIFF_BYTES = 4096;

export function parseAllowedDirs(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[:,]/)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0)
    .map((dir) => canonical(dir.replace(/^~(?=$|\/)/, homedir())));
}

function canonical(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    try {
      return join(realpathSync.native(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}

function isInside(path: string, dir: string): boolean {
  const p = path.toLowerCase();
  const d = dir.toLowerCase();
  return p === d || p.startsWith(d.endsWith(sep) ? d : d + sep);
}

function looksLikePrivateKey(path: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const head = Buffer.alloc(SNIFF_BYTES);
    const read = readSync(fd, head, 0, SNIFF_BYTES, 0);
    return PRIVATE_KEY_MARKER.test(head.subarray(0, read).toString("latin1"));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export class FileAccessPolicy {
  private readonly home: string;
  private readonly sensitiveDirs: string[];
  private readonly executableTargets: string[];

  constructor(private readonly allowedDirs: string[] = [], home: string = homedir()) {
    this.home = canonical(home);
    this.sensitiveDirs = [
      ...SENSITIVE_HOME_PATHS.map((dir) => join(this.home, dir)),
      ...SENSITIVE_SYSTEM_DIRS,
    ];
    this.executableTargets = EXECUTABLE_WRITE_TARGETS.map((dir) => join(this.home, dir));
  }

  check(path: string, action: "read" | "write"): string {
    if (!isAbsolute(path)) {
      throw new SlackAdvancedMCPError(`Path must be absolute, got: ${path}`, "PATH_NOT_ABSOLUTE");
    }

    const real = canonical(path);

    if (this.allowedDirs.length > 0) {
      if (!this.allowedDirs.some((dir) => isInside(real, dir))) {
        throw this.refuse(path, action, "it is outside SLACK_FILE_ALLOWED_DIRS");
      }
    } else if (this.isSensitive(real)) {
      throw this.refuse(path, action, "it looks like a credential or system file");
    }

    if (action === "write" && this.isExecutableTarget(real)) {
      throw this.refuse(path, action, "writing there could run code on this machine");
    }

    if (action === "read" && looksLikePrivateKey(real)) {
      throw this.refuse(path, action, "the file contains a private key");
    }

    return real;
  }

  read(path: string): Buffer {
    return readFileSync(this.check(path, "read"));
  }

  private isSensitive(real: string): boolean {
    return (
      this.sensitiveDirs.some((dir) => isInside(real, dir)) ||
      SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(basename(real)))
    );
  }

  private isExecutableTarget(real: string): boolean {
    const segments = real.split(sep);
    const isHomeDotfile = dirname(real).toLowerCase() === this.home.toLowerCase() && basename(real).startsWith(".");
    return (
      isHomeDotfile ||
      segments.some((segment) => segment.toLowerCase() === ".git") ||
      this.executableTargets.some((dir) => isInside(real, dir))
    );
  }

  private refuse(path: string, action: "read" | "write", reason: string): SlackAdvancedMCPError {
    return new SlackAdvancedMCPError(`Refusing to ${action} ${path}: ${reason}`, "PATH_NOT_ALLOWED");
  }
}
