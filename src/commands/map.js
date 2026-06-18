import { globSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertGitRepo, repoRoot } from "../git.js";
import { detectRunner, coverageArgs } from "../runner.js";
import { runQuiet } from "../exec.js";
import { coveredSourceFiles } from "../coverage.js";
import { saveMap, emptyMap, mapPath } from "../mapStore.js";
import { isTestFile } from "../select.js";

const TEST_GLOBS = ["**/*.{test,spec}.{js,jsx,ts,tsx,cjs,mjs}", "**/__tests__/**/*.{js,jsx,ts,tsx}"];

function discoverTestFiles(root) {
  const found = new Set();
  for (const pattern of TEST_GLOBS) {
    for (const f of globSync(pattern, { cwd: root, exclude: ["**/node_modules/**"] })) {
      const norm = f.split("\\").join("/");
      if (isTestFile(norm) && !norm.includes("node_modules/")) found.add(norm);
    }
  }
  return [...found];
}

export async function mapCommand() {
  assertGitRepo();
  const root = repoRoot();
  const runner = detectRunner(root);
  const testFiles = discoverTestFiles(root);

  if (!testFiles.length) {
    throw new Error("No test files found. Looked for *.test.* / *.spec.* / __tests__/**.");
  }

  console.log(`Building coverage map with ${runner} for ${testFiles.length} test file(s)...`);
  console.log("(one-time cost — runs each test file with coverage to learn its real footprint)\n");

  const map = emptyMap(runner);
  map.testFiles = testFiles;

  let i = 0;
  for (const testFile of testFiles) {
    i++;
    process.stdout.write(`  [${i}/${testFiles.length}] ${testFile} ... `);
    const outDir = mkdtempSync(join(tmpdir(), "difftest-cov-"));
    try {
      const { status } = runQuiet(root, coverageArgs(runner, testFile, outDir));
      const sources = coveredSourceFiles(root, outDir);
      for (const src of sources) {
        if (isTestFile(src)) continue; // edges are source -> test
        (map.edges[src] ||= []).push(testFile);
      }
      console.log(status === 0 ? `${sources.length} files` : `done (exit ${status})`);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }

  // de-dupe edge targets
  for (const src of Object.keys(map.edges)) {
    map.edges[src] = [...new Set(map.edges[src])];
  }

  map.generatedAt = new Date().toISOString();
  const p = saveMap(root, map);
  console.log(
    `\n✔ Map saved to ${mapPath(root)} — ${Object.keys(map.edges).length} source files tracked.`
  );
  console.log("Add .difftest/ to .gitignore (or commit it to share the map in CI).");
  return p;
}
