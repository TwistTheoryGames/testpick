# Coverage, single-pass, and selection

How testpick learns the test→source map and why it's built this way.

## Why coverage, not the static graph

Built-in selectors (`vitest --changed`, `jest --findRelatedTests`) follow the
**static import graph**. They handle literal dynamic imports (Vite globs
`` import(`./${x}.js`) ``) but **cannot** see a path that is *data*:

```ts
const REGISTRY = { feat: "../features/feat.ts" };
export const load = (n) => import(/* @vite-ignore */ REGISTRY[n]); // invisible to the graph
```

testpick records what each test **actually executed** at runtime, so this edge
appears. Honest framing for docs/marketing: coverage and the module graph are
**complementary**, not "better" —
- coverage wins on runtime-computed couplings and trims imported-but-unexecuted files;
- a static graph can flag a not-yet-exercised branch coverage hasn't seen.
That asymmetry is exactly why the run-all safety fallback exists.

## How the map is built

Two strategies, both producing identical edges (verified on fixtures):

### Single-pass (default, Vitest & Jest)
One runner startup per *shard* instead of per *file*:
1. Shard the to-measure test files across cores.
2. Each shard = one serial runner process (`vitest run` /
   `jest --runInBand`) so V8 precise coverage diffs cleanly per file.
3. A temp config is injected via `--config` that **merges the project's own
   config** (plugins, aliases, setupFiles) and appends our coverage collector:
   - Vitest: `instrument/vitest-coverage-setup.mjs` (ESM, top-level await to start
     coverage before tests).
   - Jest: `instrument/jest-coverage-setup.cjs` (CJS; a `beforeAll` awaits a
     "ready" promise so coverage is running before the file's tests).
4. The collector snapshots cumulative V8 precise coverage after each test file and
   diffs vs the previous snapshot; whatever count went up was exercised by that
   file. Results append to `TESTPICK_OUT` (one JSON line per test file).

**Fallback contract:** any test file the single pass yields no result for (e.g. a
config we couldn't merge) is simply absent from the returned map, and `map.js`
re-measures it with the isolated per-file method. So a project we can't
single-pass **never** produces a silently under-selecting map. Keep this.

### Per-file (`--per-file`, and the fallback)
One process per test file with `--coverage` → istanbul `coverage-final.json`,
parsed by `coverage.js#coveredSourceFiles` (a source file counts if any statement
hit `> 0`). Slower but immune to config-merge issues.

Benchmark (23-test fixture, 8-core): single-pass ~2.7s / ~16s CPU vs per-file
~4.9s / ~30s CPU, identical edges. Single-pass wins bigger on low-core CI.

## Selection at runtime

See `architecture.md#core-invariant`. The reverse `edges` index makes a changed
source file an O(1) lookup to its tests. `explain` prints, per changed file,
whether it was matched via coverage-map / ai / unresolved, so the decision is
never a black box.

## When you change this

- Adding a runner ⇒ add a `singlePass<Runner>` + a coverage collector + extend
  `detectRunner`/`runArgs`/`coverageArgs`, and verify single-pass edges ==
  per-file edges on a fixture.
- Touch the collectors carefully: the timing (coverage must start before tests)
  and the per-process delta accounting are subtle. Test against a fixture with a
  runtime-computed import to prove the wedge still works.
