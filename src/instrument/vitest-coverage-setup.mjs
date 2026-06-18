/**
 * Injected into a single-pass Vitest run by `difftest map`.
 *
 * We run Vitest in ONE process, serially (single fork, no file parallelism), and
 * use V8 precise coverage to attribute execution to each test file: snapshot the
 * cumulative coverage at the end of every test file and diff it against the
 * previous snapshot. Whatever went up was exercised by that file — including code
 * reached via dynamic import / DI that a static graph can't see.
 *
 * Results are appended (one JSON object per test file) to DIFFTEST_OUT.
 */
import inspector from "node:inspector";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, expect } from "vitest";

const OUT = process.env.DIFFTEST_OUT;
const ROOT = (process.env.DIFFTEST_ROOT || "").replace(/\/+$/, "");
const g = globalThis;

if (!g.__difftest_session) {
  const session = new inspector.Session();
  session.connect();
  const post = (method, params) =>
    new Promise((res, rej) =>
      session.post(method, params, (err, r) => (err ? rej(err) : res(r)))
    );
  g.__difftest_session = session;
  g.__difftest_post = post;
  g.__difftest_prev = new Map(); // script url -> cumulative count
  // Top-level await: coverage is running before any test code executes.
  await post("Profiler.enable");
  await post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
}

function relativize(p) {
  try {
    let abs = p.startsWith("file:") ? fileURLToPath(p) : p;
    if (ROOT && abs.startsWith(ROOT)) abs = abs.slice(ROOT.length).replace(/^\/+/, "");
    return abs.split("\\").join("/");
  } catch {
    return p;
  }
}

afterAll(async () => {
  const { result } = await g.__difftest_post("Profiler.takePreciseCoverage");
  const testPath = relativize(expect.getState().testPath || "");
  const touched = [];
  for (const script of result) {
    if (!script.url || !script.url.startsWith("file:")) continue;
    let total = 0;
    for (const fn of script.functions) for (const r of fn.ranges) total += r.count;
    const prev = g.__difftest_prev.get(script.url) || 0;
    g.__difftest_prev.set(script.url, total);
    if (total > prev) {
      const f = relativize(script.url);
      if (f && !f.includes("node_modules/") && !f.endsWith("vitest-coverage-setup.mjs")) {
        touched.push(f);
      }
    }
  }
  if (OUT) appendFileSync(OUT, JSON.stringify({ test: testPath, sources: touched }) + "\n");
});
