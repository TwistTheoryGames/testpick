import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { partitionChanges } from "../src/commands/shared.js";
import { findUnits } from "../src/workspaces.js";

test("partitionChanges: single repo routes everything to the root unit", () => {
  const units = [{ dir: "/r", prefix: "" }];
  const { perUnit, orphans } = partitionChanges(["a.ts", "src/b.ts"], units);
  assert.deepEqual(perUnit.get(""), ["a.ts", "src/b.ts"]);
  assert.deepEqual(orphans, []);
});

test("partitionChanges: monorepo splits per package and flags orphans", () => {
  const units = [
    { dir: "/r/packages/a", prefix: "packages/a" },
    { dir: "/r/packages/b", prefix: "packages/b" },
  ];
  const { perUnit, orphans } = partitionChanges(
    ["packages/a/src/x.ts", "packages/b/y.ts", "tsconfig.json"],
    units
  );
  assert.deepEqual(perUnit.get("packages/a"), ["src/x.ts"]);
  assert.deepEqual(perUnit.get("packages/b"), ["y.ts"]);
  assert.deepEqual(orphans, ["tsconfig.json"]); // root-level change -> orphan
});

test("partitionChanges: most-specific (nested) package wins", () => {
  const units = [
    { dir: "/r/packages/a", prefix: "packages/a" },
    { dir: "/r/packages/a/sub", prefix: "packages/a/sub" },
  ];
  const { perUnit } = partitionChanges(["packages/a/sub/z.ts"], units);
  assert.deepEqual(perUnit.get("packages/a/sub"), ["z.ts"]);
  assert.deepEqual(perUnit.get("packages/a"), []);
});

test("findUnits: no workspaces -> single root unit", () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-units-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "solo" }));
    const units = findUnits(dir);
    assert.equal(units.length, 1);
    assert.equal(units[0].prefix, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findUnits: workspaces glob expands to packages", () => {
  const dir = mkdtempSync(join(tmpdir(), "tp-units-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    for (const p of ["a", "b"]) {
      mkdirSync(join(dir, "packages", p), { recursive: true });
      writeFileSync(join(dir, "packages", p, "package.json"), JSON.stringify({ name: p }));
    }
    const prefixes = findUnits(dir)
      .map((u) => u.prefix)
      .sort();
    assert.deepEqual(prefixes, ["packages/a", "packages/b"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
