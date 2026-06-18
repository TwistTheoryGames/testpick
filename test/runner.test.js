import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRunner, runArgs, coverageArgs } from "../src/runner.js";

function fixture(pkg) {
  const dir = mkdtempSync(join(tmpdir(), "dt-pkg-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  return dir;
}

test("detectRunner finds vitest and jest from devDependencies", () => {
  const v = fixture({ devDependencies: { vitest: "^3" } });
  const j = fixture({ devDependencies: { jest: "^30" } });
  try {
    assert.equal(detectRunner(v), "vitest");
    assert.equal(detectRunner(j), "jest");
  } finally {
    rmSync(v, { recursive: true, force: true });
    rmSync(j, { recursive: true, force: true });
  }
});

test("detectRunner falls back to the test script", () => {
  const dir = fixture({ scripts: { test: "vitest run" } });
  try {
    assert.equal(detectRunner(dir), "vitest");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("detectRunner throws when neither is present", () => {
  const dir = fixture({ devDependencies: {} });
  try {
    assert.throws(() => detectRunner(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runArgs / coverageArgs shape per runner", () => {
  assert.deepEqual(runArgs("vitest", ["a.test.ts"]), ["vitest", "run", "a.test.ts"]);
  assert.deepEqual(runArgs("jest", ["a.test.ts"]), ["jest", "--runTestsByPath", "a.test.ts"]);
  assert.ok(coverageArgs("vitest", "a.test.ts", "/tmp/x").includes("--coverage.enabled"));
  assert.ok(coverageArgs("jest", "a.test.ts", "/tmp/x").includes("--coverage"));
});
