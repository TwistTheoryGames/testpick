import { readFileSync, existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";

/**
 * Parse an istanbul `coverage-final.json` and return the set of source files
 * that were actually executed (>=1 statement hit), as repo-relative paths.
 * Both Jest and Vitest can emit this format.
 */
export function coveredSourceFiles(root, coverageDir) {
  const file = join(coverageDir, "coverage-final.json");
  if (!existsSync(file)) return [];
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }

  const covered = [];
  for (const [absPath, entry] of Object.entries(data)) {
    const counts = entry.s || {}; // statement hit counts
    const hit = Object.values(counts).some((n) => n > 0);
    if (!hit) continue;
    const rel = isAbsolute(absPath) ? relative(root, absPath) : absPath;
    if (rel.startsWith("..")) continue; // outside the repo
    covered.push(rel.split("\\").join("/"));
  }
  return covered;
}
