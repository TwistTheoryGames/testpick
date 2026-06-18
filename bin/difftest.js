#!/usr/bin/env node
import { runCommand } from "../src/commands/run.js";
import { mapCommand } from "../src/commands/map.js";
import { explainCommand } from "../src/commands/explain.js";

const HELP = `difftest — run only the tests your diff can actually break

Usage:
  difftest map [--base <ref>]      Build the coverage map (run once, then refresh occasionally)
  difftest run [--base <ref>]      Run only the tests affected by your changes
  difftest explain [--base <ref>]  Show which tests would run and *why* (no execution)

Options:
  --base <ref>   Git ref to diff against (default: working tree vs HEAD).
                 In CI, use --base origin/main.
  --ai           Use an LLM to resolve changes the coverage map can't explain
                 (config/fixtures/dynamic calls). Needs ANTHROPIC_API_KEY.
                 Without it, unmapped changes safely fall back to running all tests.
  --all          With run: ignore selection and run everything (escape hatch).
  -h, --help     Show this help.

Philosophy: never skip a test that might be affected. When unsure, difftest runs more,
not less. The map catches static + runtime couplings; --ai covers the rest.`;

function parseArgs(argv) {
  const args = { _: [], base: null, ai: false, all: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--ai") args.ai = true;
    else if (a === "--all") args.all = true;
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
