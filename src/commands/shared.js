/** Argv to run a unit's full test suite. */
export function fullSuiteArgs(runner) {
  return runner === "vitest" ? ["vitest", "run"] : ["jest"];
}

/**
 * Split repo-relative changed files into per-unit, unit-relative lists.
 * Files under no package (in a monorepo) are returned as `orphans`.
 *
 * Returns { perUnit: Map<prefix, string[]>, orphans: string[] }.
 */
export function partitionChanges(changed, units) {
  const perUnit = new Map();
  for (const u of units) perUnit.set(u.prefix, []);
  const orphans = [];

  // Most-specific (longest) prefix wins, so nested packages match correctly.
  // The root unit (prefix "") sorts last and catches everything in a plain repo.
  const sorted = [...units].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const f of changed) {
    let placed = false;
    for (const u of sorted) {
      if (u.prefix === "") {
        perUnit.get("").push(f);
        placed = true;
        break;
      }
      if (f === u.prefix || f.startsWith(u.prefix + "/")) {
        perUnit.get(u.prefix).push(f.slice(u.prefix.length + 1));
        placed = true;
        break;
      }
    }
    if (!placed) orphans.push(f);
  }
  return { perUnit, orphans };
}
