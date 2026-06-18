# testpick

- **npm**: https://www.npmjs.com/package/testpick
- **GitHub**: https://github.com/TwistTheoryGames/testpick

`testpick` is a test-selection CLI for JavaScript/TypeScript. It records which
test files actually execute which source files (from runtime coverage), then on
`git diff` runs only the tests a change can affect — turning multi-minute CI runs
into seconds. Works with Vitest and Jest, single-package repos and monorepos.

## WHAT: Tech / shape

| Aspect | Choice |
|--------|--------|
| Language | Plain JavaScript, ESM (`"type": "module"`) |
| Runtime | Node `>=18` |
| Dependencies | **Zero runtime deps** (Node built-ins only) |
| Build step | **None** — `bin/testpick.js` runs the source directly |
| Tests | `node --test` (built-in runner), no test deps |
| Supported runners | Vitest, Jest |
| License | MIT |

The whole tool must keep running on a bare Node install. Do not add runtime
dependencies or a build step without a very strong reason.

## WHY: Purpose

The built-ins (`vitest --changed`, `jest --findRelatedTests`) walk the **static
import graph**, so they miss couplings it can't see — a module loaded via a
runtime-computed path (plugin registry, DI, computed `require`/`import`).
testpick uses **runtime coverage**, which captures those edges. It is honest
about being *complementary* to a module graph, not strictly better — see
`rules/coverage-and-selection.md`.

**The non-negotiable invariant: never silently skip a test that might be
affected.** When unsure, testpick runs more, not less. Any change the map can't
explain falls back to running everything. Every contributor must preserve this.

## HOW: Architecture

```
bin/testpick.js              CLI entry: arg parsing + command dispatch
src/
  commands/
    map.js                   `map` — build/refresh the coverage map (per unit)
    run.js                   `run` — select + execute affected tests (per unit)
    explain.js               `explain` — dry-run: print selection + reasoning
    shared.js                partitionChanges() (diff→per-package), fullSuiteArgs()
  git.js                     changedFiles(), repoRoot(), assertGitRepo(), ignore filter
  runner.js                  detectRunner(), runArgs(), coverageArgs(), readDeps()
  select.js                  isTestFile(), selectTests() ← the safety logic lives here
  mapStore.js                loadMap/saveMap/emptyMap/pruneTest (.testpick/map.json)
  coverage.js                coveredSourceFiles() — parse istanbul coverage-final.json
  singlepass.js              singlePassVitest/Jest() — sharded single-pass map build
  instrument/
    vitest-coverage-setup.mjs  injected V8-coverage collector (Vitest, ESM)
    jest-coverage-setup.cjs    injected V8-coverage collector (Jest, CJS)
  exec.js                    binPath() (walks up for hoisted bins), run*, pool()
  workspaces.js              findUnits() — monorepo package discovery
  fswalk.js                  walkFiles(), globToRegExp() — version-safe fs (no globSync)
test/*.test.js               unit tests (node --test)
```

**Data flow (`run`):** `changedFiles()` → `findUnits()` → `partitionChanges()`
→ per unit: `loadMap()` + `selectTests()` → `runInherit(runArgs())`.

**The map** (`.testpick/map.json`): `{ version, runner, generatedAt, testFiles[],
testHashes{}, edges{ "src/x.ts": ["a.test.ts", ...] } }`. Edges are
source → tests. Built from runtime coverage; incremental via per-file sha1.

## Conventions

- Small modules, one responsibility each. Match the existing terse style.
- Comments explain *intent / why*, not *what* — only where non-obvious.
- Errors: throw `Error` with an actionable message (the CLI catches and prints).
- Any new pure logic gets a `test/*.test.js` unit test. New selection logic
  **must** include a test for the "unsure → run it anyway" path.
- Use only Node APIs available on the **minimum supported version (18)**. See the
  Node-compat note below.

## ⚠️ Node compatibility (learned the hard way)

`fs.globSync` is Node 22+ only and once shipped a version (0.1.0) that crashed on
Node 18/20. **Do not use APIs newer than Node 18.** When in doubt, check, and let
the CI matrix (18/20/22) confirm. `src/fswalk.js` exists precisely to avoid
`fs.globSync`.

## ⚠️ Release golden rule

**`git push` → wait for CI green (Node 18/20/22) → *then* `npm publish`.** Never
publish before CI passes. 0.1.0 was published before CI finished and shipped a
broken version; following this order avoids ever releasing a broken build. Full
flow in `.claude/rules/release.md` and the `release` skill.

## Commands

```bash
node --test                       # run the unit tests (no install)
node bin/testpick.js --help       # CLI help
node bin/testpick.js map          # build the coverage map (in a vitest/jest project)
node bin/testpick.js run
node bin/testpick.js explain
```

Manual end-to-end fixtures live at: `~/projects/difftest-real` (Vitest+TS+alias),
`~/projects/testpick-jest` (Jest), `~/projects/testpick-mono` (mixed-runner monorepo).

## Detailed docs

- `.claude/rules/architecture.md` — module responsibilities & invariants
- `.claude/rules/coverage-and-selection.md` — how the map, single-pass & selection work
- `.claude/rules/release.md` — CI, Node compat, npm publish & deprecate flow

## Skills

| Skill | Trigger |
|-------|---------|
| `commit-push` | "commit and push", "コミットしてプッシュ" |
| `release` | "release", "publish a new version", "リリース", "公開" |
