---
title: "Why `vitest --changed` misses some tests (and how runtime coverage fixes it)"
published: false
tags: javascript, testing, typescript, node
# This is the canonical copy. If you cross-post to Medium/Hashnode, set THEIR
# canonical_url to this article's dev.to URL after publishing.
---

Your CI re-runs the entire test suite on every push. But a one-line change can
only break a handful of tests. The rest is wasted compute — and wasted minutes
you spend waiting.

The usual fix is "run only the tests affected by my change." Vitest and Jest
ship this:

```bash
vitest --changed
jest --onlyChanged
jest --findRelatedTests <files>
```

These are great. But they share a blind spot, and that blind spot can make them
**skip a test that your change actually breaks** — the worst possible failure
for a test selector. Let's look at exactly where they break, and a different
approach that doesn't.

## How the built-ins decide

`vitest --changed` (and `jest --findRelatedTests`) walk the **static import
graph**. They parse your modules, follow `import`/`require` statements, and find
which test files transitively import the changed file.

For the common case this works beautifully. Vitest even uses Vite's module graph,
so it's fast and precise — and it handles *literal* dynamic imports too, because
Vite globs them:

```ts
// Vite resolves this fine — it globs ./*.js into the graph
const mod = await import(`./${name}.js`);
```

So far so good. The problem starts when the import target isn't statically
analyzable.

## The case they miss: a runtime-computed path

Plenty of real code loads modules by a path that is **data**, not a literal:
plugin registries, dependency injection, feature flags, anything table-driven.

```ts
// src/plugins/loader.ts
const REGISTRY: Record<string, string> = {
  feat: "../features/feat.ts",
};

export async function load(name: string) {
  const path = REGISTRY[name];               // the path is data
  return import(/* @vite-ignore */ path);    // Vite can't analyze this
}
```

```ts
// src/loader.test.ts
import { load } from "@/plugins/loader";

test("dynamic feature", async () => {
  const m = await load("feat");
  expect(m.feat()).toBe("F");                 // exercises features/feat.ts
});
```

There is **no static import edge** from `loader.test.ts` to `features/feat.ts`.
The only thing that connects them is what happens at runtime.

Now change `features/feat.ts` and ask the built-ins what to run:

```console
$ vitest related src/features/feat.ts --run
No test files found, exiting with code 0
```

```console
$ jest --findRelatedTests src/features/feat.js
No tests found, exiting with code 1
```

Both say **"nothing to run"** — and they're wrong. `loader.test.ts` exercises
that file and would catch a regression. A selector you trust would have just let
a real breakage through.

## The fix: select from what actually ran

Static analysis answers "what *could* be imported." Coverage answers "what *was*
executed." If you record, per test file, which source files it actually touched
at runtime, the registry/DI case stops being special — the edge shows up because
the code really ran.

That's the idea behind [testpick](https://github.com/TwistTheoryGames/testpick),
a small CLI I built. Two commands:

```bash
npx testpick map     # learn the test → source map once (from runtime coverage)
npx testpick run     # from then on, run only what your diff can break
```

On the same change:

```console
$ testpick run
testpick: 1/3 test file(s) affected by 1 change(s).
 ✓ src/loader.test.ts
```

It picks `loader.test.ts` because, when the map was built, that test's run
actually executed `features/feat.ts`. (This holds for Jest too — same example,
same result.)

## Building the map without it being slow

The obvious objection: collecting per-test coverage sounds expensive. The naive
way — run each test file in its own process with coverage — pays the runner's
startup cost N times.

testpick does it **single-pass**: it shards the test files across your cores and
runs each shard as *one* serial runner process (`vitest run` /
`jest --runInBand`), using V8 precise coverage. It snapshots cumulative coverage
after each test file and diffs it against the previous snapshot — whatever went
up was exercised by that file.

On a 23-test fixture (8-core machine):

| Strategy | Wall-clock | Total CPU |
| --- | --- | --- |
| process-per-file (parallel) | 4.9s | ~30s |
| single-pass (sharded) | **2.7s** | **~16s** |

~1.8x faster wall-clock and ~4x less CPU — and the resulting map came out
**identical** to the per-file method. On CI boxes with fewer cores, the
single-pass win is bigger.

The map is also incremental: it hashes test files and only re-measures the ones
that changed, so refreshing it is nearly free.

## The part that matters most: never skip silently

A test selector is only useful if you can trust it not to drop a test you needed.
testpick's rule is: **when in doubt, run more, never less.**

- A changed file the map doesn't know about (a brand-new file, a config) →
  it runs **everything** by default.
- `testpick explain` prints exactly why each test was selected or skipped — no
  black box.
- There's an optional `--ai` mode that asks an LLM to narrow down unmapped
  changes, but even it can only *add* tests; if the model is unsure, it still
  falls back to running everything.

## Being honest: it's complementary, not "better"

I don't want to oversell this. A coverage map and a static module graph catch
*different* things:

- **Coverage wins** on runtime-computed couplings (registry/DI) and on trimming
  imported-but-never-executed modules.
- **The static graph wins** when a change touches a branch your recorded run
  hasn't exercised yet — coverage hasn't "seen" it.

That asymmetry is exactly why the safety fallback above matters, and why testpick
works the same way for Jest, where there's no Vite graph to lean on.

## Monorepos

testpick detects workspaces (`workspaces` in package.json, or
`pnpm-workspace.yaml`) and treats each package as its own unit — its own runner,
its own map. A repo with a Vitest package and a Jest package both works:

```console
$ testpick run
Monorepo: 2 package(s).
[packages/api]  3/41 test file(s) affected by 2 change(s).
[packages/web]  1/120 test file(s) affected by 1 change(s).
```

Changing one package doesn't run another's tests. A change *outside* every
package (root config, lockfile) is treated as potentially affecting everything,
so it safely runs all packages.

## Try it

```bash
npx testpick map
npx testpick run

# in CI:
npx testpick run --base origin/main
```

- GitHub: https://github.com/TwistTheoryGames/testpick
- npm: https://www.npmjs.com/package/testpick

It's MIT, plain Node (no build step, no runtime deps), Vitest + Jest. It's early
(v0.1), and I'd genuinely love feedback — especially numbers from real, large
suites and monorepos. If `vitest --changed` already covers your case perfectly,
great; if you've ever been bitten by a dynamically-loaded module slipping through
selection, this is for you.
