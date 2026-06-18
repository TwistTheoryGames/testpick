/**
 * Injected into a single-pass Jest run by `testpick map` (via setupFilesAfterEnv).
 *
 * Jest runs in one process with --runInBand, so V8 precise coverage can be diffed
 * per test file: a beforeAll guarantees coverage is running before the file's
 * tests, and an afterAll snapshots the cumulative counts and diffs them against
 * the previous file's snapshot. Whatever went up was exercised by this file —
 * including code reached via a computed require() that Jest's static analysis
 * can't see.
 *
 * CommonJS (Jest evaluates setup files as CJS by default). Results are appended
 * (one JSON object per test file) to TESTPICK_OUT.
 */
const inspector = require("node:inspector");
const { appendFileSync } = require("node:fs");
const { fileURLToPath } = require("node:url");

const OUT = process.env.TESTPICK_OUT;
const ROOT = (process.env.TESTPICK_ROOT || "").replace(/\/+$/, "");
const g = globalThis;

if (!g.__testpick_session) {
  const session = new inspector.Session();
  session.connect();
  const post = (method, params) =>
    new Promise((res, rej) => session.post(method, params, (err, r) => (err ? rej(err) : res(r))));
  g.__testpick_session = session;
  g.__testpick_post = post;
  g.__testpick_prev = new Map(); // script id/url -> cumulative count
  g.__testpick_ready = post("Profiler.enable").then(() =>
    post("Profiler.startPreciseCoverage", { callCount: true, detailed: true })
  );
}

// Returns a repo-relative path, or null if the script isn't a source file in this repo.
function relativize(url) {
  if (!url || url.startsWith("node:")) return null;
  let abs;
  try {
    abs = url.startsWith("file:") ? fileURLToPath(url) : url;
  } catch {
    return null;
  }
  if (!ROOT || !abs.startsWith(ROOT)) return null;
  const rel = abs.slice(ROOT.length).replace(/^\/+/, "").split("\\").join("/");
  if (rel.includes("node_modules/") || rel.endsWith("jest-coverage-setup.cjs")) return null;
  return rel;
}

beforeAll(async () => {
  await g.__testpick_ready; // coverage is definitely running before this file's tests
});

afterAll(async () => {
  const { result } = await g.__testpick_post("Profiler.takePreciseCoverage");
  const testPath = relativize(expect.getState().testPath) || expect.getState().testPath || "";
  const touched = [];
  for (const script of result) {
    let total = 0;
    for (const fn of script.functions) for (const r of fn.ranges) total += r.count;
    const prev = g.__testpick_prev.get(script.url) || 0;
    g.__testpick_prev.set(script.url, total);
    if (total > prev) {
      const f = relativize(script.url);
      if (f) touched.push(f);
    }
  }
  if (OUT) appendFileSync(OUT, JSON.stringify({ test: testPath, sources: touched }) + "\n");
});
