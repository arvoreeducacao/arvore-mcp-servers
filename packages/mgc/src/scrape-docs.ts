#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docusaurusToMdRoot = resolve(__dirname, "../../../../docusaurus-to-md");

const baseUrl = process.env.MAGALU_BASE_URL || "https://dev.magalu.com";
const pathPrefix = process.env.MAGALU_PATH_PREFIX || "/docs/";
const outputDir = process.env.MAGALU_DOCS_DIR || resolve(__dirname, "..", "docs-cache");

console.error(`Scraping ${baseUrl} (prefix: ${pathPrefix})...`);
console.error(`Output: ${outputDir}`);

execSync(
  `npx tsx src/cli.ts ${baseUrl} -p "${pathPrefix}" -o "${outputDir}"`,
  {
    cwd: docusaurusToMdRoot,
    stdio: "inherit",
  }
);

console.error("Scrape complete.");
