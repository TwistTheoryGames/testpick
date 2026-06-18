import { spawnSync, spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

/**
 * Resolve a locally-installed runner binary, walking up from `root` so hoisted
 * monorepo binaries (in the workspace root's node_modules/.bin) are found.
 */
export function binPath(root, name) {
  const bin = process.platform === "win32" ? `${name}.cmd` : name;
  let dir = root;
  for (;;) {
    const p = join(dir, "node_modules", ".bin", bin);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`${name} is not installed (looked in node_modules/.bin up from ${root}).`);
}

/** Run a runner command, inheriting stdio so the user sees live test output. */
export function runInherit(root, argv) {
  const [name, ...rest] = argv;
  const r = spawnSync(binPath(root, name), rest, { cwd: root, stdio: "inherit" });
  return r.status ?? 1;
}

/** Run a runner command quietly (used while building the map). */
export function runQuiet(root, argv) {
  const [name, ...rest] = argv;
  const r = spawnSync(binPath(root, name), rest, { cwd: root, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Async variant so map building can run many coverage passes concurrently. */
export function runQuietAsync(root, argv, opts = {}) {
  return new Promise((resolve) => {
    const [name, ...rest] = argv;
    let bin;
    try {
      bin = binPath(root, name);
    } catch (err) {
      return resolve({ status: 1, stdout: "", stderr: err.message });
    }
    const env = opts.env ? { ...process.env, ...opts.env } : process.env;
    const child = spawn(bin, rest, { cwd: root, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ status: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ status: 1, stdout, stderr: String(err) }));
  });
}

/** Bounded-concurrency map over async work. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(lanes);
  return results;
}
