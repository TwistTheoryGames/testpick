import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir, availableParallelism } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { assertGitRepo, repoRoot } from "../git.js";
import { detectRunner, coverageArgs, readDeps } from "../runner.js";
import { runQuietAsync, pool } from "../exec.js";
import { coveredSourceFiles } from "../coverage.js";
import { loadMap, saveMap, emptyMap, mapPath, pruneTest } from "../mapStore.js";
import { isTestFile } from "../select.js";
import { singlePassVitest, singlePassJest } from "../singlepass.js";
import { findUnits } from "../workspaces.js";
import { walkFiles } from "../fswalk.js";

function discoverTestFiles(root) {
  return walkFiles(root).filter((f) => isTestFile(f));
}

function hashFile(root, file) {
  try {
    return createHash("sha1").update(readFileSync(join(root, file))).digest("hex");
  } catch {
    return null;
  }
}

function addEdges(map, testFile, sources) {
  pruneTest(map, testFile); // drop any stale edges before re-adding
  for (const src of sources) {
    if (isTestFile(src)) continue; // edges are source -> test
    (map.edges[src] ||= []).push(testFile);
  }
}

/** Isolated, one-process-per-file measurement (robust fallback / Jest path). */
async function measurePerFile(root, runner, testFile) {
  const outDir = mkdtempSync(join(tmpdir(), "testpick-cov-"));
  try {
    await runQuietAsync(root, coverageArgs(runner, testFile, outDir));
    return coveredSourceFiles(root, outDir);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

export async function mapCommand(args = {}) {
  assertGitRepo();
  const root = repoRoot();
  const units = findUnits(root);
  const monorepo = units.length > 1;
  const rootDeps = readDeps(root);
  if (monorepo) console.log(`Monorepo detected: ${units.length} package(s).\n`);

  for (const unit of units) {
    if (monorepo) console.log(`▶ ${unit.prefix || "."}`);
    try {
      await mapUnit(unit.dir, args, rootDeps);
    } catch (err) {
      if (!monorepo) throw err; // single repo: surface the error as before
      console.log(`  skipped: ${err.message}\n`);
    }
  }
}

async function mapUnit(root, args = {}, rootDeps = null) {
  const runner = detectRunner(root, rootDeps);
  const testFiles = discoverTestFiles(root);

  if (!testFiles.length) {
    throw new Error("No test files found. Looked for *.test.* / *.spec.* / __tests__/**.");
  }

  const prev = args.full ? null : loadMap(root);
  const map = prev && prev.runner === runner ? prev : emptyMap(runner);
  map.testHashes ||= {};

  // Drop edges/hashes for test files that no longer exist.
  const live = new Set(testFiles);
  for (const old of map.testFiles || []) {
    if (!live.has(old)) {
      pruneTest(map, old);
      delete map.testHashes[old];
    }
  }
  map.testFiles = testFiles;

  // Only (re)measure new or changed test files.
  const hashes = Object.fromEntries(testFiles.map((f) => [f, hashFile(root, f)]));
  const todo = testFiles.filter((f) => map.testHashes[f] !== hashes[f]);
  const skipped = testFiles.length - todo.length;

  if (!todo.length) {
    console.log(`Map is already up to date (${testFiles.length} test files unchanged). ✔`);
    return mapPath(root);
  }

  const jobs = Math.max(1, args.jobs || availableParallelism());
  const singlePass = (runner === "vitest" || runner === "jest") && !args.perFile;

  let measured = 0;
  let fallbacks = [];

  if (singlePass) {
    console.log(
      `Mapping ${todo.length} test file(s) with ${runner} in ${Math.min(jobs, todo.length)} ` +
        `single-pass shard(s)` +
        (skipped ? ` (${skipped} unchanged, reused)` : "") +
        ".\n"
    );
    const { byTest } =
      runner === "vitest"
        ? await singlePassVitest(root, todo, jobs)
        : await singlePassJest(root, todo, jobs);
    for (const f of todo) {
      const sources = byTest.get(f);
      if (sources && sources.length) {
        addEdges(map, f, sources);
        map.testHashes[f] = hashes[f];
        measured++;
      } else {
        fallbacks.push(f); // unaccounted for → measure in isolation, never guess
      }
    }
    if (fallbacks.length) {
      console.log(
        `  single pass covered ${measured}/${todo.length}; ` +
          `re-measuring ${fallbacks.length} in isolation (custom setup or no coverage).`
      );
    }
  } else {
    fallbacks = todo;
    console.log(
      `Mapping ${todo.length} test file(s) with ${runner}` +
        (skipped ? ` (${skipped} unchanged, reused)` : "") +
        ` — up to ${jobs} in parallel.\n`
    );
  }

  if (fallbacks.length) {
    let done = 0;
    await pool(fallbacks, jobs, async (testFile) => {
      const sources = await measurePerFile(root, runner, testFile);
      addEdges(map, testFile, sources);
      map.testHashes[testFile] = hashes[testFile];
      done++;
      console.log(`  [${done}/${fallbacks.length}] ${testFile} … ${sources.length} files`);
    });
  }

  for (const src of Object.keys(map.edges)) {
    map.edges[src] = [...new Set(map.edges[src])];
  }

  map.generatedAt = new Date().toISOString();
  saveMap(root, map);
  console.log(
    `\n✔ Map saved to ${mapPath(root)} — ${Object.keys(map.edges).length} source files tracked.`
  );
  if (!prev) console.log("Add .testpick/ to .gitignore (or commit it to share the map in CI).");
  return mapPath(root);
}
