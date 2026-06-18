import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { walkFiles, globToRegExp } from "./fswalk.js";

/**
 * A "unit" is an independently-tested package: its own dir, its own runner, its
 * own coverage map. In a plain repo there's exactly one unit (the root). In a
 * monorepo there's one per workspace package.
 *
 * Returns [{ dir, prefix }] where prefix is the repo-relative path ("" for root).
 */
export function findUnits(root) {
  const patterns = workspacePatterns(root);
  if (!patterns.length) return [{ dir: root, prefix: "" }];

  const regexes = patterns.map(globToRegExp);
  const pkgDirs = walkFiles(root)
    .filter((f) => f === "package.json" || f.endsWith("/package.json"))
    .map((f) => f.slice(0, Math.max(0, f.length - "package.json".length)).replace(/\/$/, ""))
    .filter((d) => d !== ""); // exclude the root package.json

  const units = [];
  for (const prefix of pkgDirs) {
    if (regexes.some((re) => re.test(prefix))) {
      units.push({ dir: join(root, prefix), prefix });
    }
  }
  return units.length ? units : [{ dir: root, prefix: "" }];
}

function workspacePatterns(root) {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      let ws = pkg.workspaces;
      if (ws && !Array.isArray(ws)) ws = ws.packages; // { packages: [...] } form
      if (Array.isArray(ws) && ws.length) return ws;
    } catch {
      /* ignore */
    }
  }
  // Minimal pnpm-workspace.yaml support: collect the `- 'glob'` list entries.
  const pnpm = join(root, "pnpm-workspace.yaml");
  if (existsSync(pnpm)) {
    const pats = [];
    for (const line of readFileSync(pnpm, "utf8").split("\n")) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m) pats.push(m[1].trim());
    }
    if (pats.length) return pats;
  }
  return [];
}
