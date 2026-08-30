import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { RouteInfo } from "./types.js";

export function getChangedRoutes(repoPath: string, baseUrl: string): RouteInfo[] {
  const diff = execSync("git diff --name-only HEAD", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const staged = execSync("git diff --name-only --cached", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const untracked = execSync("git ls-files --others --exclude-standard", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const allFiles = [...new Set([
    ...diff.split("\n").filter(Boolean),
    ...staged.split("\n").filter(Boolean),
    ...untracked.split("\n").filter(Boolean),
  ])];

  const appDir = findAppDir(repoPath);
  if (!appDir) return [];

  const routeMap = new Map<string, string[]>();

  for (const file of allFiles) {
    const route = fileToRoute(file, appDir, repoPath);
    if (route) {
      const existing = routeMap.get(route) || [];
      existing.push(file);
      routeMap.set(route, existing);
    }
  }

  return Array.from(routeMap.entries()).map(([route, files]) => ({
    route,
    url: `${baseUrl}${route}`,
    files,
  }));
}

function findAppDir(repoPath: string): string | null {
  const candidates = [
    "src/app",
    "app",
  ];

  for (const candidate of candidates) {
    const fullPath = resolve(repoPath, candidate);
    if (existsSync(fullPath)) return candidate;
  }

  return null;
}

let dynamicSegmentDefaults: Record<string, string> = {
  "[locale]": "app-v2",
  "[lang]": "pt-BR",
};

export function setDynamicSegmentDefaults(defaults: Record<string, string>) {
  dynamicSegmentDefaults = { ...dynamicSegmentDefaults, ...defaults };
}

function fileToRoute(file: string, appDir: string, _repoPath: string): string | null {
  if (!file.startsWith(appDir + "/")) return null;

  const relativePath = file.slice(appDir.length + 1);
  const parts = relativePath.split("/");

  const isRelevantFile = parts.some(p =>
    p.startsWith("page.") || p.startsWith("layout.") || p.endsWith(".tsx") || p.endsWith(".ts")
  );

  if (!isRelevantFile) return null;

  const routeParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith("page.") || part.startsWith("layout.") || part.endsWith(".tsx") || part.endsWith(".ts")) break;
    if (part.startsWith("(") && part.endsWith(")")) continue;
    if (part === "api") return null;
    if (part.startsWith("[") && part.endsWith("]")) {
      const defaultVal = dynamicSegmentDefaults[part];
      if (defaultVal) {
        routeParts.push(defaultVal);
      } else {
        routeParts.push(part);
      }
      continue;
    }
    routeParts.push(part);
  }

  if (routeParts.length === 0) return "/";

  return "/" + routeParts.join("/");
}

export function getComponentRoutes(repoPath: string, baseUrl: string): RouteInfo[] {
  const diff = execSync("git diff --name-only HEAD", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const staged = execSync("git diff --name-only --cached", {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const allFiles = [...new Set([
    ...diff.split("\n").filter(Boolean),
    ...staged.split("\n").filter(Boolean),
  ])];

  const componentFiles = allFiles.filter(f =>
    (f.includes("/components/") || f.includes("/features/")) &&
    (f.endsWith(".tsx") || f.endsWith(".ts"))
  );

  if (componentFiles.length === 0) return [];

  const appDir = findAppDir(repoPath);
  if (!appDir) return [];

  const affectedRoutes = new Map<string, string[]>();

  for (const componentFile of componentFiles) {
    const componentName = extractExportName(repoPath, componentFile);
    if (!componentName) continue;

    try {
      const grep = execSync(
        `grep -rl "${componentName}" ${appDir}/ --include="*.tsx" --include="*.ts" 2>/dev/null | head -5`,
        { cwd: repoPath, encoding: "utf-8" }
      );

      for (const pageFile of grep.split("\n").filter(Boolean)) {
        const route = fileToRoute(pageFile, appDir, repoPath);
        if (route) {
          const existing = affectedRoutes.get(route) || [];
          existing.push(componentFile);
          affectedRoutes.set(route, existing);
        }
      }
    } catch {
      // grep found nothing
    }
  }

  return Array.from(affectedRoutes.entries()).map(([route, files]) => ({
    route,
    url: `${baseUrl}${route}`,
    files,
  }));
}

function extractExportName(_repoPath: string, file: string): string | null {
  const parts = file.split("/");
  const fileName = parts[parts.length - 1];
  const name = fileName.replace(/\.(tsx?|jsx?)$/, "");
  if (name === "index") {
    return parts.length > 1 ? parts[parts.length - 2] : null;
  }
  return name;
}
