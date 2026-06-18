import { assertGitRepo, repoRoot, changedFiles } from "../git.js";
import { detectRunner, runArgs, readDeps } from "../runner.js";
import { loadMap } from "../mapStore.js";
import { selectTests } from "../select.js";
import { runInherit } from "../exec.js";
import { findUnits } from "../workspaces.js";
import { partitionChanges, fullSuiteArgs } from "./shared.js";

export async function runCommand(args) {
  assertGitRepo();
  const root = repoRoot();
  const units = findUnits(root);
  const monorepo = units.length > 1;
  if (monorepo) console.log(`Monorepo: ${units.length} package(s).`);

  const rootDeps = readDeps(root);
  const changed = changedFiles(args.base);
  const { perUnit, orphans } = partitionChanges(changed, units);

  // A change outside every package (root config, lockfile…) can affect anything.
  // Safety first: run everything. (Build artifacts are already filtered out.)
  const forceAll = args.all || (monorepo && orphans.length > 0);
  if (monorepo && orphans.length && !args.all) {
    console.log(`Changes outside any package → running all packages to be safe: ${orphans.join(", ")}`);
  }

  let worst = 0;
  let ranAnything = false;

  for (const unit of units) {
    const label = monorepo ? `[${unit.prefix || "."}] ` : "";
    let runner;
    try {
      runner = detectRunner(unit.dir, rootDeps);
    } catch (err) {
      if (monorepo) continue; // package without a known runner
      throw err;
    }

    if (forceAll) {
      console.log(`${label}running full suite.`);
      worst = Math.max(worst, runInherit(unit.dir, fullSuiteArgs(runner)));
      ranAnything = true;
      continue;
    }

    const pkgChanged = perUnit.get(unit.prefix) || [];
    if (!pkgChanged.length) continue; // nothing changed here

    const map = loadMap(unit.dir);
    if (!map) {
      console.log(`${label}no map yet → running full suite (run \`testpick map\` to enable selection).`);
      worst = Math.max(worst, runInherit(unit.dir, fullSuiteArgs(runner)));
      ranAnything = true;
      continue;
    }

    const { tests, runAll } = await selectTests(pkgChanged, map, { ai: args.ai });
    if (!tests.length) continue;

    if (runAll) {
      console.log(`${label}changes the map can't explain → running all ${tests.length} test file(s) to be safe.`);
    } else {
      console.log(
        `${label}${tests.length}/${map.testFiles.length} test file(s) affected by ${pkgChanged.length} change(s).`
      );
    }
    worst = Math.max(worst, runInherit(unit.dir, runArgs(runner, tests)));
    ranAnything = true;
  }

  if (!ranAnything) {
    console.log(changed.length ? "No tests affected by your changes. ✔" : "No changed files — skipping tests. ✔");
    return;
  }
  process.exit(worst);
}
