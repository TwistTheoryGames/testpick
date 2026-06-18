import { spawnSync, spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

/** Resolve a locally-installed runner binary (node_modules/.bin/<name>). */
export function binPath(root, name) {
  const bin = process.platform === "win32" ? `${name}.cmd` : name;
  const p = join(root, "node_modules", ".bin", bin);
  if (!existsSync(p)) {
    throw new Error(`${name} is not installed in this project (looked in node_modules/.bin).`);
  }
  return p;
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
export function runQuietAsync(root, argv) {
  return new Promise((resolve) => {
    const [name, ...rest] = argv;
    let bin;
    try {
      bin = binPath(root, name);
    } catch (err) {
      return resolve({ status: 1, stdout: "", stderr: err.message });
    }
    const child = spawn(bin, rest, { cwd: root });
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
