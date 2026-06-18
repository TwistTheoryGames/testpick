# testpick Architecture

Module responsibilities and the invariants that hold them together. Read before
changing selection, the map format, or the command flow.

## Commands (orchestration)

All three commands are **unit-aware**: they call `findUnits()` and loop over
packages. In a plain repo there is exactly one unit (`{ dir: root, prefix: "" }`),
so the single-repo path is just the monorepo path with one unit.

- **`map.js`** — discovers test files (`walkFiles` + `isTestFile`), figures out
  which test files are new/changed (sha1 vs `testHashes`), measures them, writes
  `.testpick/map.json`. Per unit: own runner, own map. Errors in one package are
  caught and reported only in monorepo mode; in a single repo they propagate.
- **`run.js`** — `changedFiles()` once at repo root → `partitionChanges()` splits
  them per unit (and surfaces *orphans*: files under no package). Per unit it
  selects and runs. Exit code is the worst child status.
- **`explain.js`** — same selection, no execution; prints reasons.

## Core invariant: never silently skip

`select.js#selectTests(changed, map, opts)` is the heart. Rules:

1. A changed **test file** → run it directly.
2. A changed **source file in the map** → run its mapped tests.
3. A changed file **not in the map** (new file, config, fixture) → it is
   *unresolved*. Unresolved files trigger **run-all** (the safe fallback), unless
   `--ai` confidently narrows them — and even then, if the model is unsure, it
   still returns run-all. **The AI can only add tests, never cause a skip.**

In monorepos, a change **outside every package** (orphan: root config, lockfile)
is treated as potentially-global → run all packages.

Any change to this logic must keep these properties and add a test that proves a
plausibly-affected test is never dropped.

## The map (`mapStore.js`)

`.testpick/map.json`:
```json
{ "version": 1, "runner": "vitest", "generatedAt": "...",
  "testFiles": ["a.test.ts"], "testHashes": { "a.test.ts": "<sha1>" },
  "edges": { "src/x.ts": ["a.test.ts"] } }
```
- `edges` are **source → tests** (reverse index for fast lookup on diff).
- `pruneTest()` removes a test from all edges before re-measuring it (avoids stale
  edges on incremental rebuilds).
- Incremental: only test files whose sha1 changed are re-measured.

## Runner detection (`runner.js`)

`detectRunner(dir, rootDeps?)` priority: package deps → `pkg.jest` field →
config files → `test` script → **hoisted root deps** (`readDeps(repoRoot)`).
The hoisted fallback matters for monorepos where the runner is only in root deps.

## Execution (`exec.js`)

- `binPath(dir, name)` **walks up** the tree looking for `node_modules/.bin/<name>`
  so hoisted monorepo binaries resolve. Never assume the bin is in `dir`.
- `pool(items, limit, worker)` — bounded concurrency for parallel measurement.
- `runInherit` (live stdio for `run`), `runQuietAsync` (captured, for `map`).

## Filesystem (`fswalk.js`)

`walkFiles(root)` is a `readdirSync` recursion that skips `node_modules`, `.git`,
and dot-dirs. It replaced `fs.globSync` (Node 22+ only). **Use this, not glob.**
`globToRegExp` converts workspace globs (`packages/*`, `apps/**`) to anchored
RegExps for `findUnits`.

## Git (`git.js`)

`changedFiles(base)` returns repo-relative paths (working tree + staged +
untracked, or `base...HEAD` + uncommitted when `--base` is given). It filters
build/tool artifacts via `IGNORE_RE` (node_modules, .testpick, dist, coverage,
…) so they never force a needless run-all.
