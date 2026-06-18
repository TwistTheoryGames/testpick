import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestFile, selectTests } from "../src/select.js";

test("isTestFile recognises common patterns", () => {
  assert.ok(isTestFile("src/a.test.ts"));
  assert.ok(isTestFile("src/a.spec.js"));
  assert.ok(isTestFile("pkg/__tests__/a.ts"));
  assert.ok(isTestFile("a.test.tsx"));
  assert.ok(!isTestFile("src/a.ts"));
  assert.ok(!isTestFile("src/contest.ts")); // not a false match on "test"
});

test("selectTests: a mapped source change runs its tests", async () => {
  const map = { testFiles: ["a.test.ts", "b.test.ts"], edges: { "src/a.ts": ["a.test.ts"] } };
  const r = await selectTests(["src/a.ts"], map, {});
  assert.deepEqual(r.tests, ["a.test.ts"]);
  assert.equal(r.runAll, false);
});

test("selectTests: a changed test file is selected directly", async () => {
  const map = { testFiles: ["a.test.ts"], edges: {} };
  const r = await selectTests(["a.test.ts"], map, {});
  assert.deepEqual(r.tests, ["a.test.ts"]);
  assert.equal(r.runAll, false);
});

test("selectTests: an unmapped change falls back to running everything", async () => {
  const map = { testFiles: ["a.test.ts", "b.test.ts"], edges: {} };
  const r = await selectTests(["src/brand-new.ts"], map, {}); // ai disabled
  assert.equal(r.runAll, true);
  assert.deepEqual([...r.tests].sort(), ["a.test.ts", "b.test.ts"]);
});

test("selectTests: nothing affected runs nothing", async () => {
  const map = { testFiles: ["a.test.ts"], edges: { "src/a.ts": ["a.test.ts"] } };
  const r = await selectTests(["src/unrelated.ts"], map, { ai: false });
  // unrelated.ts is unmapped -> safe fallback to all (never silently skip)
  assert.equal(r.runAll, true);
});
