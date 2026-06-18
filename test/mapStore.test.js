import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyMap, pruneTest } from "../src/mapStore.js";

test("emptyMap has the expected shape", () => {
  const m = emptyMap("vitest");
  assert.equal(m.runner, "vitest");
  assert.deepEqual(m.testFiles, []);
  assert.deepEqual(m.edges, {});
  assert.deepEqual(m.testHashes, {});
});

test("pruneTest removes a test from every edge and drops empties", () => {
  const map = {
    edges: {
      "src/a.ts": ["a.test.ts", "b.test.ts"],
      "src/b.ts": ["b.test.ts"],
    },
  };
  pruneTest(map, "b.test.ts");
  assert.deepEqual(map.edges["src/a.ts"], ["a.test.ts"]);
  assert.equal("src/b.ts" in map.edges, false); // emptied -> deleted
});
