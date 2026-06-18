# Contributing to difftest

Thanks for your interest! difftest is intentionally small and dependency-free
(plain Node ESM, no build step).

## Dev setup

```bash
git clone <your fork>
cd difftest
node --test            # run the unit tests (no install needed)
node bin/difftest.js --help
```

## Trying it against a real project

```bash
cd /path/to/some/vitest-or-jest-project
node /path/to/difftest/bin/difftest.js map
node /path/to/difftest/bin/difftest.js explain
```

## Guidelines

- Keep the core dependency-free. The whole tool should run with just Node.
- **Safety is the contract:** difftest must never silently skip a test that could
  be affected. When in doubt, select more. New selection logic needs a test in
  `test/` covering the "unsure → run it anyway" path.
- Add a unit test for any new pure logic (`test/*.test.js`, run by `node --test`).
- Match the existing style: small modules, clear names, comments only where intent
  isn't obvious from the code.

## Good first issues

- Single-pass coverage for Jest (Vitest has it; Jest currently uses per-file).
- Monorepo package-level selection.
- Additional runners / languages.
