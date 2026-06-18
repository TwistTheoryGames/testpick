import { assertGitRepo, repoRoot, changedFiles } from "../git.js";
import { detectRunner, runArgs } from "../runner.js";
import { loadMap } from "../mapStore.js";
import { selectTests } from "../select.js";
import { runInherit } from "../exec.js";

export async function runCommand(args) {
  assertGitRepo();
  const root = repoRoot();
  const runner = detectRunner(root);

  if (args.all) {
    console.log("Running the full test suite (--all).");
    process.exit(runInherit(root, [runner, runner === "vitest" ? "run" : ""].filter(Boolean)));
  }

  const map = loadMap(root);
  if (!map) throw new Error("No coverage map yet. Run `difftest map` first.");

  const changed = changedFiles(args.base);
  if (!changed.length) {
    console.log("No changed files — skipping tests. ✔");
    return;
  }

  const { tests, runAll } = await selectTests(changed, map, { ai: args.ai });

  if (!tests.length) {
    console.log("No tests affected by your changes. ✔");
    return;
  }

  if (runAll) {
    console.log(
      `Changes include files the map can't explain → running all ${tests.length} test file(s) to be safe.`
    );
  } else {
    console.log(
      `difftest: ${tests.length}/${map.testFiles.length} test file(s) affected by ${changed.length} change(s).`
    );
  }
  console.log("");

  const status = runInherit(root, runArgs(runner, tests));
  process.exit(status);
}
