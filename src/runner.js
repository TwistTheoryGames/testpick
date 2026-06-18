import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const VITEST_CONFIGS = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs", "vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];
const JEST_CONFIGS = ["jest.config.js", "jest.config.cjs", "jest.config.mjs", "jest.config.ts", "jest.config.json"];

/** Read root package.json deps (used as a hoisted-deps fallback for workspaces). */
export function readDeps(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

/**
 * Detect the test runner for a directory. Monorepo packages often omit the
 * runner from their own deps (it's hoisted), so we also use config files, the
 * package.json `jest` field, the test script, and finally the hoisted root deps.
 */
export function detectRunner(root, rootDeps = null) {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error("No package.json found. testpick v0.1 targets JS/TS projects.");
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps.vitest) return "vitest";
  if (deps.jest || deps["ts-jest"]) return "jest";

  // config-based signals
  if (pkg.jest) return "jest";
  if (VITEST_CONFIGS.some((c) => existsSync(join(root, c)))) return "vitest";
  if (JEST_CONFIGS.some((c) => existsSync(join(root, c)))) return "jest";

  // test script
  const testScript = pkg.scripts?.test || "";
  if (testScript.includes("vitest")) return "vitest";
  if (testScript.includes("jest")) return "jest";

  // hoisted workspace deps (lowest priority — ambiguous if root has both)
  if (rootDeps) {
    if (rootDeps.vitest) return "vitest";
    if (rootDeps.jest || rootDeps["ts-jest"]) return "jest";
  }

  throw new Error(
    "Could not detect Jest or Vitest. " +
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
