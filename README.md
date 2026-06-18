# testpick

[![npm](https://img.shields.io/npm/v/testpick.svg)](https://www.npmjs.com/package/testpick)
[![CI](https://github.com/TwistTheoryGames/testpick/actions/workflows/ci.yml/badge.svg)](https://github.com/TwistTheoryGames/testpick/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/testpick.svg)](https://www.npmjs.com/package/testpick)
[![license](https://img.shields.io/npm/l/testpick.svg)](./LICENSE)

**Run only the tests your diff can actually break.**

`testpick` is a test-selection CLI for JavaScript/TypeScript. It looks at what you
changed (`git diff`) and runs just the tests affected by those changes — turning
multi-minute CI runs into seconds.

```bash
npx testpick map     # one-time: learn which tests touch which code
npx testpick run     # from now on: run only what your changes affect
```

## Demo

```console
$ testpick map
Mapping 23 test file(s) with vitest in 8 single-pass shard(s).
✔ Map saved to .testpick/map.json — 24 source files tracked.

$ vim src/util.ts        # change one file...

$ testpick run
testpick: 1/23 test file(s) affected by 1 change(s).

 ✓ src/greet.test.ts (1 test) 4ms

$ testpick explain       # ...and see *why*
Changed files (1):
  • src/util.ts
Decisions:
  ✓ src/util.ts  [coverage map → 1 test(s)]
      → src/greet.test.ts
Result: run 1 of 23 test file(s).
```

> Want a GIF for your README/socials? A ready-to-run [`vhs`](https://github.com/charmbracelet/vhs)
> script lives at [`demo.tape`](./demo.tape): `brew install vhs && vhs demo.tape`.

## Why not just `vitest --changed` / `jest --onlyChanged`?

Those are great — until your code has couplings their **static import graph can't
see**:

- a module loaded via a **runtime-computed path** — a plugin registry, DI
  container, or `import(/* @vite-ignore */ pathFromConfig)`. Vite can glob a
  *literal* `import(\`./${name}.js\`)`, but it cannot analyze a path that's data.
- code reached only at runtime that the static graph **over- or under-counts**

testpick builds its map from **runtime coverage** — what each test *actually
executed* — so it captures those edges. Verified example (see `testpick-real`
fixture):

```ts
const REGISTRY = { feat: "../features/feat.ts" };
export const load = (n) => import(/* @vite-ignore */ REGISTRY[n]); // Vite can't see this
```

| Change `features/feat.ts` | result |
| --- | --- |
| `vitest related features/feat.ts` | **No test files found** ❌ |
| `testpick run` | runs `loader.test.ts` ✅ |

> Note: testpick and Vite's module graph are complementary, not strictly better.
> A coverage map is more precise for runtime-computed couplings and for trimming
> imported-but-unexecuted modules; the static graph can flag a yet-to-run branch a
> coverage map hasn't seen. That's why testpick always errs toward running more
> (see below) — and why it works the same for Jest, where there's no Vite graph.

## Safety first

A test selector is only useful if you can trust it not to skip something important.
testpick's rule: **when in doubt, run more — never less.**

- Changed a file the map doesn't know about (new file, config)? → it runs **all**
  tests by default.
- Pass `--ai` and it asks an LLM to narrow those unmapped changes to likely tests —
  but if the model is unsure, it *still* falls back to running everything. The AI
  can never cause a skip.
- `testpick explain` shows exactly **why** each test was selected or skipped.

## Commands

```bash
testpick map [--base <ref>]      # build/refresh the coverage map
testpick run [--base <ref>]      # run only affected tests
testpick explain [--base <ref>]  # dry-run: print the selection + reasoning
```

| Option | Meaning |
| --- | --- |
| `--base <ref>` | Diff against a ref (CI: `--base origin/main`). Default: working tree vs HEAD. |
| `--ai` | Use an LLM (needs `ANTHROPIC_API_KEY`) to resolve unmapped changes. |
| `--all` | Escape hatch: run the whole suite. |
| `--full` | `map` only: rebuild from scratch instead of incrementally. |
| `-j, --jobs <n>` | `map` only: max concurrent coverage passes (default: CPU count). |

### Fast maps

`testpick map` is built for speed three ways:

- **Single-pass (Vitest, default):** instead of starting the runner once per test
  file, testpick shards the files across your cores and runs each shard as one
  serial Vitest process, attributing V8 precise-coverage deltas to each file. Far
  fewer startups — measurably faster wall-clock *and* less total CPU than
  one-process-per-file. Use `--per-file` to opt out (Jest uses per-file today).
- **Incremental:** each test file is hashed; only changed/new files are
  re-measured. A no-op refresh is instant; editing one test re-maps just that file.
- **Parallel:** the per-file path (and the shards) run up to one lane per CPU
  (`-j` to tune).

Use `--full` to force a clean rebuild. If single-pass can't account for a file
(e.g. a project config it couldn't merge), that file falls back to isolated
per-file measurement automatically — the map is never silently incomplete.

## In CI (GitHub Actions)

```yaml
- run: npm ci
- run: npx testpick run --base origin/${{ github.base_ref }}
```

Commit `.testpick/map.json` to share the map across CI runs, or rebuild it on a
schedule.

## Status

v0.1 — supports **Vitest** and **Jest**. Roadmap: faster single-pass map building,
monorepo package-level selection, and more runners/languages.

MIT licensed.
