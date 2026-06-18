/**
 * AI augmentation for changes the coverage map can't explain: new files, config,
 * fixtures, dynamic dispatch. The model only ever *narrows* — it picks from the
 * known test files. On any doubt or error we report `resolved: false` so the
 * caller falls back to running everything. The model can never cause a skip.
 */

const MODEL = "claude-haiku-4-5-20251001"; // cheap + fast; this is a classification task

export async function suggestTestsForUnmapped(unmapped, testFiles, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { resolved: false, reason: "no ANTHROPIC_API_KEY" };
  }
  if (!testFiles.length) {
    return { resolved: false, reason: "empty test set" };
  }

  const prompt = [
    "You map changed files to the test files that could be affected.",
    "Be CONSERVATIVE: if a change could plausibly affect a test, include it.",
    "You may ONLY choose from the provided test file list. Never invent paths.",
    "",
    "Changed files with no known coverage edge:",
    ...unmapped.map((f) => `- ${f}`),
    "",
    "Known test files:",
    ...testFiles.map((f) => `- ${f}`),
    "",
    'Reply ONLY with JSON: {"results":[{"file":"<changed>","tests":["<test>",...],"note":"<why, short>"}]}',
    'If you cannot tell for a changed file, set its "tests" to the FULL test list.',
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return { resolved: false, reason: `api ${res.status}` };
    }
    const data = await res.json();
    const text = data.content?.map((c) => c.text || "").join("") ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const valid = new Set(testFiles);
    const results = (json.results || []).map((r) => ({
      file: r.file,
      tests: (r.tests || []).filter((t) => valid.has(t)),
      note: r.note || "",
    }));
    if (!results.length) return { resolved: false, reason: "empty result" };
    return { resolved: true, results };
  } catch (err) {
    return { resolved: false, reason: err.message };
  }
}
