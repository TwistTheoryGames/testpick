import { assertGitRepo, repoRoot, changedFiles } from "../git.js";
import { loadMap } from "../mapStore.js";
import { selectTests } from "../select.js";
import { findUnits } from "../workspaces.js";
import { partitionChanges } from "./shared.js";

export async function explainCommand(args) {
  assertGitRepo();
  const root = repoRoot();
  const units = findUnits(root);
  const monorepo = units.length > 1;

  const changed = changedFiles(args.base);
  if (!changed.length) {
    console.log("No changed files. Nothing to run.");
    return;
  }
  const { perUnit, orphans } = partitionChanges(changed, units);

  if (monorepo && orphans.length) {
    console.log(`⚠ Changes outside any package → would run ALL packages to be safe:`);
    for (const f of orphans) console.log(`    ↳ ${f}`);
    console.log("");
  }

  for (const unit of units) {
    const pkgChanged = perUnit.get(unit.prefix) || [];
    if (!pkgChanged.length) continue;

    if (monorepo) console.log(`▶ ${unit.prefix || "."}`);
    const map = loadMap(unit.dir);
    if (!map) {
      console.log(`  no map yet — run \`testpick map\`. Would run the full suite.\n`);
      continue;
    }

    const { tests, runAll, reasons } = await selectTests(pkgChanged, map, { ai: args.ai });
    printReasons(reasons, "  ");
    if (runAll) {
      console.log(`  → run ALL ${tests.length} test file(s) (safe fallback).\n`);
    } else {
      console.log(`  → run ${tests.length} of ${map.testFiles.length} test file(s): ${tests.join(", ")}\n`);
    }
  }
}

function printReasons(reasons, indent) {
  for (const r of reasons) {
    if (r.decision === "run-all") {
      console.log(`${indent}⚠ run ALL — ${r.via}`);
    } else if (r.decision === "run") {
      const via =
        r.via === "coverage-map"
          ? `coverage map → ${r.tests.length} test(s)`
          : r.via === "ai"
            ? `AI: ${r.note || "related"}`
            : r.via;
      console.log(`${indent}✓ ${r.file}  [${via}]`);
      for (const t of r.tests || []) console.log(`${indent}    → ${t}`);
    } else {
      console.log(`${indent}? ${r.file}  [unresolved]`);
    }
  }
}
