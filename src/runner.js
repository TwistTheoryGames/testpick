import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Detect the test runner from package.json. We deliberately support the two
 * runners whose built-in change detection is weakest or absent at CI level.
 */
export function detectRunner(root) {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error("No package.json found. testpick v0.1 targets JS/TS projects.");
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps.vitest) return "vitest";
  if (deps.jest || deps["ts-jest"]) return "jest";

  // fall back to whatever the test script mentions
  const testScript = pkg.scripts?.test || "";
  if (testScript.includes("vitest")) return "vitest";
  if (testScript.includes("jest")) return "jest";

  throw new Error(
    "Could not detect Jest or Vitest in package.json. " +
      "testpick v0.1 supports those two; more runners are on the roadmap."
  );
}

/**
 * Build the argv to run a specific set of test files under the given runner.
 */
export function runArgs(runner, testFiles) {
  if (runner === "vitest") {
    // `run` = single pass (no watch); pass explicit files
    return ["vitest", "run", ...testFiles];
  }
  // jest: pass files as positional path patterns; --runTestsByPath = literal paths
  return ["jest", "--runTestsByPath", ...testFiles];
}

/**
 * Build the argv to collect per-file coverage for one test file (used by `map`).
 */
export function coverageArgs(runner, testFile, outDir) {
  if (runner === "vitest") {
    return [
      "vitest",
      "run",
      testFile,
      "--coverage.enabled",
      "--coverage.all=false",
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${outDir}`,
    ];
  }
  return [
    "jest",
    "--runTestsByPath",
    testFile,
    "--coverage",
    "--coverageReporters=json",
    `--coverageDirectory=${outDir}`,
    "--collectCoverageFrom=**/*.{js,jsx,ts,tsx}",
  ];
}
