import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coveredSourceFiles } from "../src/coverage.js";

test("coveredSourceFiles returns only executed files, repo-relative", () => {
  const root = mkdtempSync(join(tmpdir(), "dt-root-"));
  const covDir = mkdtempSync(join(tmpdir(), "dt-cov-"));
  try {
    const data = {
      [join(root, "src/hit.js")]: { s: { 0: 3, 1: 0 } }, // executed
      [join(root, "src/miss.js")]: { s: { 0: 0, 1: 0 } }, // never executed
      ["/elsewhere/outside.js"]: { s: { 0: 5 } }, // outside repo -> ignored
    };
    writeFileSync(join(covDir, "coverage-final.json"), JSON.stringify(data));
    const got = coveredSourceFiles(root, covDir).sort();
    assert.deepEqual(got, ["src/hit.js"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(covDir, { recursive: true, force: true });
  }
});

test("coveredSourceFiles is empty when no report exists", () => {
  const covDir = mkdtempSync(join(tmpdir(), "dt-cov-"));
  try {
    assert.deepEqual(coveredSourceFiles("/x", covDir), []);
  } finally {
    rmSync(covDir, { recursive: true, force: true });
  }
});
