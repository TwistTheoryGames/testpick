import { suggestTestsForUnmapped } from "./ai.js";

const TEST_RE = /(\.|\/)(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\//;

export function isTestFile(file) {
  return TEST_RE.test(file);
}

/**
 * Decide which tests to run for a set of changed files.
 *
 * Returns:
 *   { tests: string[], runAll: boolean, reasons: Reason[] }
 *
 * A Reason explains *why* each decision was made — this is what `explain` prints
 * and what makes the tool trustworthy instead of a black box.
 *
 * Core rule: never silently skip. Any changed file we can't account for makes us
 * run everything, unless --ai can confidently narrow it down.
 */
export async function selectTests(changed, map, opts = {}) {
  const reasons = [];
  const tests = new Set();
  const unmapped = [];

  for (const file of changed) {
    if (isTestFile(file)) {
      tests.add(file);
      reasons.push({ file, decision: "run", via: "changed-test-file" });
      continue;
    }
    const mapped = map.edges[file];
    if (mapped && mapped.length) {
      for (const t of mapped) tests.add(t);
      reasons.push({ file, decision: "run", via: "coverage-map", tests: mapped });
    } else {
      unmapped.push(file);
      reasons.push({ file, decision: "unresolved", via: "not-in-map" });
    }
  }

  // Files the coverage map can't explain: the dangerous part. Try AI, else run all.
  if (unmapped.length) {
    if (opts.ai) {
      const ai = await suggestTestsForUnmapped(unmapped, map.testFiles, opts);
      if (ai.resolved) {
        for (const r of ai.results) {
          for (const t of r.tests) tests.add(t);
          const idx = reasons.findIndex((x) => x.file === r.file);
          if (idx >= 0)
            reasons[idx] = { file: r.file, decision: "run", via: "ai", tests: r.tests, note: r.note };
        }
      } else {
        return {
          tests: [...map.testFiles],
          runAll: true,
          reasons: [
            ...reasons,
            { file: "(unmapped changes)", decision: "run-all", via: "ai-uncertain", files: unmapped },
          ],
        };
      }
    } else {
      return {
        tests: [...map.testFiles],
        runAll: true,
        reasons: [
          ...reasons,
          { file: "(unmapped changes)", decision: "run-all", via: "safe-fallback", files: unmapped },
        ],
      };
    }
  }

  return { tests: [...tests], runAll: false, reasons };
}
