import { execFileSync } from "node:child_process";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" });
  } catch (err) {
    const msg = err.stderr?.toString().trim() || err.message;
    throw new Error(`git ${args.join(" ")} failed: ${msg}`);
  }
}

export function assertGitRepo() {
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new Error("Not a git repository. difftest needs git to know what changed.");
  }
}

export function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]).trim();
}

/**
 * Return the list of changed files (relative to repo root).
 * - base = null  -> uncommitted changes (working tree + staged) vs HEAD
 * - base = <ref> -> everything that differs from <ref> (e.g. origin/main in CI)
 */
export function changedFiles(base) {
  let out;
  if (base) {
    out = git(["diff", "--name-only", `${base}...HEAD`]);
    // also include uncommitted work so local `explain` matches reality
    out += "\n" + git(["diff", "--name-only", "HEAD"]);
    out += "\n" + git(["diff", "--name-only", "--cached"]);
  } else {
    out = git(["diff", "--name-only", "HEAD"]);
    out += "\n" + git(["diff", "--name-only", "--cached"]);
    out += "\n" + git(["ls-files", "--others", "--exclude-standard"]); // new untracked files
  }
  const seen = new Set();
  for (const line of out.split("\n")) {
    const f = line.trim();
    if (f && !isIgnored(f)) seen.add(f);
  }
  return [...seen];
}

// Tool/build artifacts that are never meaningful source changes, even when a
// project forgets to .gitignore them. Keeps difftest from a needless run-all.
const IGNORE_RE = /(^|\/)(node_modules|\.difftest|\.git|coverage|dist|build|\.next|\.turbo|\.vite)(\/|$)/;

function isIgnored(file) {
  return IGNORE_RE.test(file);
}
