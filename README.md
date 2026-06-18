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

- a test reaches a module via a **dynamic `import()`**, DI, or a string-keyed lookup
- a change to a **JSON fixture, config file, or env-driven branch**
- a **shared global** or a generated file

difftest builds its map from **runtime coverage** — what each test *actually
executed* — so it captures those edges. Real example from the test suite:

| Change | `vitest related` | `difftest` |
| --- | --- | --- |
| edit `strings.js` (used only via `import(\`./${name}.js\`)`) | runs `strings.test.js` ❌ misses the dynamic caller | runs `strings.test.js` **and** `loader.test.js` ✅ |

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

`difftest map` measures test files **in parallel** (one lane per CPU) and is
**incremental**: it hashes each test file and only re-measures the ones that
changed since the last map. A no-op refresh is instant; editing one test re-maps
just that file. Use `--full` to force a clean rebuild.

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
