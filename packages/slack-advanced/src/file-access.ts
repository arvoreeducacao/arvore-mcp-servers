import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { SlackAdvancedMCPError } from "./types.js";

const SENSITIVE_HOME_DIRS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".kube",
  ".docker",
  ".config",
  ".azure",
  ".gcloud",
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

const SENSITIVE_FILE_PATTERNS = [/^\.env(\..*)?$/, /^id_[a-z0-9]+$/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/];

const SENSITIVE_SYSTEM_DIRS = ["/etc", "/private/etc", "/var/root", "/root"];

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
    return realpathSync(absolute);
  } catch {
    try {
      return join(realpathSync(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);
}

export class FileAccessPolicy {
  private readonly home: string;
  private readonly sensitiveDirs: string[];

  constructor(private readonly allowedDirs: string[] = [], home: string = homedir()) {
    this.home = canonical(home);
    this.sensitiveDirs = [
      ...SENSITIVE_HOME_DIRS.map((dir) => join(this.home, dir)),
      ...SENSITIVE_SYSTEM_DIRS,
    ];
  }

  check(path: string, action: "read" | "write"): string {
    if (!isAbsolute(path)) {
      throw new SlackAdvancedMCPError(`Path must be absolute, got: ${path}`, "PATH_NOT_ABSOLUTE");
    }

    const real = canonical(path);

    if (this.allowedDirs.length > 0) {
      if (!this.allowedDirs.some((dir) => isInside(real, dir))) {
        throw new SlackAdvancedMCPError(
          `Refusing to ${action} ${path}: it is outside SLACK_FILE_ALLOWED_DIRS`,
          "PATH_NOT_ALLOWED"
        );
      }
      return real;
    }

    const blocked =
      this.sensitiveDirs.some((dir) => isInside(real, dir)) ||
      SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(basename(real)));

    if (blocked) {
      throw new SlackAdvancedMCPError(
        `Refusing to ${action} ${path}: it looks like a credential or system file`,
        "PATH_NOT_ALLOWED"
      );
    }

    return real;
  }
}
