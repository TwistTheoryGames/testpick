import { readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/**
 * Recursively list files under `root` as forward-slash paths relative to `root`.
 * Skips node_modules, .git and dot-directories. Uses only readdirSync so it works
 * on every supported Node version (fs.globSync is Node 22+ — we avoid it).
 */
export function walkFiles(root) {
  const out = [];
  (function rec(dir, rel) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        rec(join(dir, e.name), r);
      } else if (e.isFile()) {
        out.push(r);
      }
    }
  })(root, "");
  return out;
}

/** Convert a workspace glob ("packages/*", "apps/**") to an anchored RegExp. */
export function globToRegExp(pattern) {
  const trimmed = pattern.replace(/\/+$/, "");
  const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // keep * and /
  const body = escaped
    .replace(/\*\*/g, "\0") // placeholder for **
    .replace(/\*/g, "[^/]*") // * = one path segment
    .replace(/\0/g, ".*"); // ** = any depth
  return new RegExp(`^${body}$`);
}
