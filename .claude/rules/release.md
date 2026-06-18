# Release & CI

How to ship a new version safely. testpick is published to npm and the published
artifact runs on end-users' machines, so correctness across Node versions matters.

## CI

`.github/workflows/ci.yml` runs `node --test` on the matrix **Node 18, 20, 22**.
This matrix is load-bearing: local dev is on a newer Node and won't catch
APIs that don't exist on the minimum supported version. Keep 18 in the matrix as
long as `engines.node` is `>=18`.

## The golden rule

**Push and wait for CI green BEFORE `npm publish`.** Version 0.1.0 was published
before CI finished and shipped a Node-18/20 crash (`fs.globSync`). Publishing is
hard to undo. Order:

1. Make the change, run `node --test` locally.
2. Bump `package.json` `version` (semver: patch for fixes, minor for features).
3. Commit, `git push`.
4. **Wait for CI to pass on all Node versions** (`gh run list` / the Actions tab).
5. Only then `npm publish` (see below).

## Publishing (requires the maintainer's terminal)

npm has 2FA enabled (account `ksugiyama`), so publish is interactive — it can't be
done from an automated tool. The maintainer runs, in their own terminal:

```bash
cd ~/projects/testpick && npm publish --access public
# approve the browser 2FA prompt → "+ testpick@<version>"
```

Verify from anywhere:
```bash
npm view testpick version          # should be the new version
npx -y testpick@<version> --help   # smoke test from the registry
```

## If a published version is broken

Deprecate it so new installs avoid it (publish the fix first):
```bash
npm deprecate testpick@<bad> "Broken on <...>; please use <good>+"
```
(0.1.0 is deprecated for the Node `<22` crash; 0.1.1 is the fix.)

## What ships to npm

`package.json#files` is `["bin", "src", "README.md"]`. So `test/`, `article/`,
`assets/`, and `.claude/` are **not** in the npm tarball (README image paths
resolve to GitHub via the `repository` field). If you add a runtime file outside
`bin`/`src`, add it to `files` or it won't be published.

## Node-compat checklist before release

- No `fs.globSync` or other Node 22+ APIs (see `architecture.md#filesystem`).
- `node --test` green locally.
- CI green on 18/20/22.
