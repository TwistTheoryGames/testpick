# difftest

**Run only the tests your diff can actually break.**

`difftest` is a test-selection CLI for JavaScript/TypeScript. It looks at what you
changed (`git diff`) and runs just the tests affected by those changes — turning
multi-minute CI runs into seconds.

```bash
npx difftest map     # one-time: learn which tests touch which code
npx difftest run     # from now on: run only what your changes affect
```

## Why not just `vitest --changed` / `jest --onlyChanged`?

Those are great — until your code has couplings their **static import graph can't
see**:

- a module loaded via a **runtime-computed path** — a plugin registry, DI
  container, or `import(/* @vite-ignore */ pathFromConfig)`. Vite can glob a
  *literal* `import(\`./${name}.js\`)`, but it cannot analyze a path that's data.
- code reached only at runtime that the static graph **over- or under-counts**

difftest builds its map from **runtime coverage** — what each test *actually
executed* — so it captures those edges. Verified example (see `difftest-real`
fixture):

```ts
const REGISTRY = { feat: "../features/feat.ts" };
export const load = (n) => import(/* @vite-ignore */ REGISTRY[n]); // Vite can't see this
```

| Change `features/feat.ts` | result |
| --- | --- |
| `vitest related features/feat.ts` | **No test files found** ❌ |
| `difftest run` | runs `loader.test.ts` ✅ |

> Note: difftest and Vite's module graph are complementary, not strictly better.
> A coverage map is more precise for runtime-computed couplings and for trimming
> imported-but-unexecuted modules; the static graph can flag a yet-to-run branch a
> coverage map hasn't seen. That's why difftest always errs toward running more
> (see below) — and why it works the same for Jest, where there's no Vite graph.

## Safety first

A test selector is only useful if you can trust it not to skip something important.
difftest's rule: **when in doubt, run more — never less.**

- Changed a file the map doesn't know about (new file, config)? → it runs **all**
  tests by default.
- Pass `--ai` and it asks an LLM to narrow those unmapped changes to likely tests —
  but if the model is unsure, it *still* falls back to running everything. The AI
  can never cause a skip.
- `difftest explain` shows exactly **why** each test was selected or skipped.

## Commands

```bash
difftest map [--base <ref>]      # build/refresh the coverage map
difftest run [--base <ref>]      # run only affected tests
difftest explain [--base <ref>]  # dry-run: print the selection + reasoning
```

| Option | Meaning |
| --- | --- |
| `--base <ref>` | Diff against a ref (CI: `--base origin/main`). Default: working tree vs HEAD. |
| `--ai` | Use an LLM (needs `ANTHROPIC_API_KEY`) to resolve unmapped changes. |
| `--all` | Escape hatch: run the whole suite. |
| `--full` | `map` only: rebuild from scratch instead of incrementally. |
| `-j, --jobs <n>` | `map` only: max concurrent coverage passes (default: CPU count). |

### Fast maps

`difftest map` is built for speed three ways:

- **Single-pass (Vitest, default):** instead of starting the runner once per test
  file, difftest shards the files across your cores and runs each shard as one
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
- run: npx difftest run --base origin/${{ github.base_ref }}
```

Commit `.difftest/map.json` to share the map across CI runs, or rebuild it on a
schedule.

## Status

v0.1 — supports **Vitest** and **Jest**. Roadmap: faster single-pass map building,
monorepo package-level selection, and more runners/languages.

MIT licensed.
