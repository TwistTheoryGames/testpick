import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runQuietAsync, pool } from "./exec.js";

const INSTRUMENT = join(dirname(fileURLToPath(import.meta.url)), "instrument");
const SETUP = join(INSTRUMENT, "vitest-coverage-setup.mjs");
const JEST_SETUP = join(INSTRUMENT, "jest-coverage-setup.cjs");

const USER_CONFIGS = [
  "vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs",
  "vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs",
];

function findUserConfig(root) {
  return USER_CONFIGS.find((c) => existsSync(join(root, c))) || null;
}

/**
 * A temp Vitest config that forces single-fork serial execution and injects our
 * coverage collector. When the project has its own config we mergeConfig() onto
 * it, so plugins, aliases and the project's own setupFiles all still apply (and
 * array fields like setupFiles concatenate — we add to them, we don't replace).
 */
function configSource(root, userConfig) {
  const setup = JSON.stringify(SETUP);
  const override = `{ test: { setupFiles: [${setup}], pool: "forks", poolOptions: { forks: { singleFork: true } }, fileParallelism: false, coverage: { enabled: false } } }`;
  if (userConfig) {
    return [
      `import { mergeConfig } from "vitest/config";`,
      `import userMod from ${JSON.stringify("./" + userConfig)};`,
      `const user = userMod && userMod.default ? userMod.default : userMod;`,
      `export default mergeConfig(user, ${override});`,
    ].join("\n");
  }
  return [`import { defineConfig } from "vitest/config";`, `export default defineConfig(${override});`].join("\n");
}

function shard(items, n) {
  const buckets = Array.from({ length: Math.min(n, items.length) }, () => []);
  items.forEach((it, i) => buckets[i % buckets.length].push(it));
  return buckets;
}

function readResults(out, byTest) {
  if (!existsSync(out)) return;
  for (const line of readFileSync(out, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const { test, sources } = JSON.parse(line);
      byTest.set(test, sources || []);
    } catch {
      /* ignore malformed line */
    }
  }
}

/**
 * Build per-test-file coverage with sharded single-pass runs: split the test
 * files into `jobs` shards and run each as one serial single-fork Vitest process,
 * concurrently. That's `jobs` Vite startups (not one-per-file) AND full core
 * utilisation. Within a shard, V8 precise coverage is diffed per file; shards are
 * separate processes so their coverage never mixes. Returns Map<testFile, sources>.
 *
 * Any file that yields no result (e.g. a config we couldn't merge) is simply
 * absent from the map — the caller re-measures those in isolation, so a project
 * we can't single-pass never produces a silently under-selecting map.
 */
export async function singlePassVitest(root, testFiles, jobs = 1) {
  const dir = mkdtempSync(join(tmpdir(), "testpick-sp-"));
  const userConfig = findUserConfig(root);
  // The temp config lives in the repo root so relative plugin/config imports resolve.
  const cfgPath = join(root, ".testpick.tmp.vitest.config.mjs");
  writeFileSync(cfgPath, configSource(root, userConfig));

  const shards = shard(testFiles, Math.max(1, jobs));
  const byTest = new Map();
  let status = 0;

  try {
    await pool(shards, shards.length, async (files, i) => {
      const out = join(dir, `results-${i}.jsonl`);
      const r = await runQuietAsync(
        root,
        ["vitest", "run", ...files, "--config", cfgPath],
        { env: { TESTPICK_OUT: out, TESTPICK_ROOT: root } }
      );
      if (r.status) status = r.status;
      readResults(out, byTest);
    });
    return { byTest, status };
  } finally {
    rmSync(cfgPath, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

const JEST_CONFIGS = ["jest.config.js", "jest.config.cjs", "jest.config.json"];

/**
 * A temp Jest config (CJS) that extends the project's own config and appends our
 * coverage collector to setupFilesAfterEnv. We load jest.config.{js,cjs,json} if
 * present, else the "jest" field of package.json. Configs we can't require from
 * CJS (jest.config.mjs/ts) fall through to {} and those files get the isolated
 * per-file fallback instead.
 */
function jestConfigSource(root) {
  const found = JEST_CONFIGS.find((c) => existsSync(join(root, c)));
  const setup = JSON.stringify(JEST_SETUP);
  const loadBase = found
    ? `let base = require(${JSON.stringify("./" + found)}); base = base && base.default ? base.default : base;`
    : `let base = {}; try { base = require(${JSON.stringify("./package.json")}).jest || {}; } catch {}`;
  return [
    loadBase,
    `module.exports = Object.assign({}, base, {`,
    `  setupFilesAfterEnv: [].concat(base.setupFilesAfterEnv || [], [${setup}]),`,
    `  collectCoverage: false,`,
    `});`,
  ].join("\n");
}

/**
 * Jest counterpart to singlePassVitest: each shard is one `jest --runInBand`
 * process (serial within the shard so V8 coverage diffs cleanly), shards run
 * concurrently. Same fallback contract — unaccounted files are absent from the
 * returned map and re-measured in isolation by the caller.
 */
export async function singlePassJest(root, testFiles, jobs = 1) {
  const dir = mkdtempSync(join(tmpdir(), "testpick-sp-"));
  const cfgPath = join(root, ".testpick.tmp.jest.config.cjs");
  writeFileSync(cfgPath, jestConfigSource(root));

  const shards = shard(testFiles, Math.max(1, jobs));
  const byTest = new Map();
  let status = 0;

  try {
    await pool(shards, shards.length, async (files, i) => {
      const out = join(dir, `results-${i}.jsonl`);
      const r = await runQuietAsync(
        root,
        ["jest", "--config", cfgPath, "--runInBand", "--runTestsByPath", ...files],
        { env: { TESTPICK_OUT: out, TESTPICK_ROOT: root } }
      );
      if (r.status) status = r.status;
      readResults(out, byTest);
    });
    return { byTest, status };
  } finally {
    rmSync(cfgPath, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}
