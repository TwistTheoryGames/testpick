import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const MAP_DIR = ".testpick";
const MAP_FILE = "map.json";

export function mapPath(root) {
  return join(root, MAP_DIR, MAP_FILE);
}

/**
 * The map records, for each test file, which source files it actually exercised
 * at runtime (from coverage). This is the part static import graphs can't see:
 * a test reaches a source file via dynamic import, DI, or a string-keyed lookup
 * and the map still records the edge.
 *
 * Shape:
 * {
 *   version: 1,
 *   runner: "vitest" | "jest",
 *   generatedAt: "<iso>",            // stamped by the caller
 *   testFiles: ["a.test.ts", ...],   // every test file known at map time
 *   edges: { "src/foo.ts": ["a.test.ts", "b.test.ts"], ... }  // source -> tests
 * }
 */
export function loadMap(root) {
  const p = mapPath(root);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    throw new Error(`Corrupt map at ${p}. Re-run \`testpick map\` to rebuild.`);
  }
}

export function saveMap(root, map) {
  const p = mapPath(root);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(map, null, 2));
  return p;
}

export function emptyMap(runner) {
  return { version: 1, runner, generatedAt: null, testFiles: [], testHashes: {}, edges: {} };
}

/** Remove every edge pointing at a given test file (used before re-measuring it). */
export function pruneTest(map, testFile) {
  for (const src of Object.keys(map.edges)) {
    const kept = map.edges[src].filter((t) => t !== testFile);
    if (kept.length) map.edges[src] = kept;
    else delete map.edges[src];
  }
}
