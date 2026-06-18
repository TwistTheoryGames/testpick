import { spawnSync } from "node:child_process";
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
