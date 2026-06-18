import { assertGitRepo, repoRoot, changedFiles } from "../git.js";
import { loadMap } from "../mapStore.js";
import { selectTests } from "../select.js";

export async function explainCommand(args) {
  assertGitRepo();
  const root = repoRoot();
  const map = loadMap(root);
  if (!map) throw new Error("No coverage map yet. Run `testpick map` first.");

  const changed = changedFiles(args.base);
  if (!changed.length) {
    console.log("No changed files. Nothing to run.");
    return;
  }

  const { tests, runAll, reasons } = await selectTests(changed, map, { ai: args.ai });

  console.log(`Changed files (${changed.length}):`);
  for (const f of changed) console.log(`  • ${f}`);
  console.log("");

  console.log("Decisions:");
  for (const r of reasons) {
    if (r.decision === "run-all") {
      console.log(`  ⚠ run ALL tests — ${r.via}`);
      for (const f of r.files || []) console.log(`      ↳ ${f}`);
    } else if (r.decision === "run") {
      const via =
        r.via === "coverage-map"
          ? `coverage map → ${r.tests.length} test(s)`
          : r.via === "ai"
            ? `AI: ${r.note || "related"}`
            : r.via;
      console.log(`  ✓ ${r.file}  [${via}]`);
      for (const t of r.tests || []) console.log(`      → ${t}`);
    } else {
      console.log(`  ? ${r.file}  [unresolved]`);
    }
  }
  console.log("");

  if (runAll) {
    console.log(`Result: run ALL ${tests.length} test file(s) (safe fallback — see warnings above).`);
    console.log("Tip: pass --ai to let an LLM narrow unmapped changes.");
  } else {
    console.log(`Result: run ${tests.length} of ${map.testFiles.length} test file(s):`);
    for (const t of tests) console.log(`  → ${t}`);
  }
}
