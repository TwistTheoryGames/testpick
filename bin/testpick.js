#!/usr/bin/env node
import { runCommand } from "../src/commands/run.js";
import { mapCommand } from "../src/commands/map.js";
import { explainCommand } from "../src/commands/explain.js";

const HELP = `testpick — run only the tests your diff can actually break

Usage:
  testpick map [--base <ref>]      Build the coverage map (run once, then refresh occasionally)
  testpick run [--base <ref>]      Run only the tests affected by your changes
  testpick explain [--base <ref>]  Show which tests would run and *why* (no execution)

Options:
  --base <ref>   Git ref to diff against (default: working tree vs HEAD).
                 In CI, use --base origin/main.
  --ai           Use an LLM to resolve changes the coverage map can't explain
                 (config/fixtures/dynamic calls). Needs ANTHROPIC_API_KEY.
                 Without it, unmapped changes safely fall back to running all tests.
  --all          With run: ignore selection and run everything (escape hatch).
  --full         With map: rebuild from scratch (default is incremental).
  --per-file     With map: isolate each test in its own process (Vitest default is
                 single-pass). Slower but immune to custom-setup overrides.
  -j, --jobs <n> With map: max concurrent coverage passes (default: CPU count).
  -h, --help     Show this help.

Philosophy: never skip a test that might be affected. When unsure, testpick runs more,
not less. The map catches static + runtime couplings; --ai covers the rest.`;

function parseArgs(argv) {
  const args = { _: [], base: null, ai: false, all: false, full: false, perFile: false, jobs: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--ai") args.ai = true;
    else if (a === "--all") args.all = true;
    else if (a === "--full") args.full = true;
    else if (a === "--per-file") args.perFile = true;
    else if (a === "--jobs" || a === "-j") args.jobs = parseInt(argv[++i], 10);
    else if (a === "-h" || a === "--help") args.help = true;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (args.help || !cmd) {
    console.log(HELP);
    process.exit(args.help ? 0 : 1);
  }

  try {
    switch (cmd) {
      case "map":
        await mapCommand(args);
        break;
      case "run":
        await runCommand(args);
        break;
      case "explain":
        await explainCommand(args);
        break;
      default:
        console.error(`Unknown command: ${cmd}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n✖ ${err.message}`);
    process.exit(1);
  }
}

main();
