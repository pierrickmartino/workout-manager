import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const output = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-layout-evidence");
const sources = [];
for (const file of ["results.json.gz", "supplementary.json.gz", "states.json.gz", "catalog-data.json.gz"]) {
  sources.push({ file, ...JSON.parse(gunzipSync(await readFile(resolve(output, file))).toString()) });
}
const results = sources.flatMap(source => source.results);
const failures = sources.flatMap(source => (source.failures ?? []).map(failure => ({
  ...failure, source: source.file,
  recovered: results.some(result => ["browser", "skin", "mode", "journey", "state", "width", "height", "count"].every(key => failure[key] === undefined || result[key] === failure[key])),
})));
const cases = results.map(result => {
  const { texts, overflow, unresolved, ...meta } = result;
  const low = texts.filter(text => !text.disabled && text.ratio < text.threshold);
  return { ...meta, measuredTextCount: texts.length, lowContrastCount: low.length,
    lowContrastExamples: low.slice(0, 12), unresolvedCount: unresolved.length,
    unresolvedExamples: unresolved.slice(0, 5), overflowCount: overflow.length, overflowExamples: overflow.slice(0, 12) };
});
const tokenFloors = results.filter(result => result.journey === "contrast" && result.mode !== "system").map(result => ({
  browser: result.browser, skin: result.skin, mode: result.mode,
  minimum: Math.min(...result.texts.filter(text => /^(base|surface|elevated) (primary|secondary|muted)$/.test(text.text)).map(text => text.ratio)),
  muted: result.texts.filter(text => /^(base|surface|elevated) muted$/.test(text.text)),
}));
const systemChecks = results.filter(result => result.mode === "system").map(result => {
  const explicit = results.find(other => other.browser === result.browser && other.skin === result.skin && other.mode === result.preference && other.journey === "contrast");
  const ramp = sample => sample.texts.filter(text => /^(base|surface|elevated) (primary|secondary|muted)$/.test(text.text));
  return { browser: result.browser, skin: result.skin, preference: result.preference, matchesExplicit: JSON.stringify(ramp(result)) === JSON.stringify(ramp(explicit)) };
});
await writeFile(resolve(output, "summary.json"), JSON.stringify({ revision: sources[0].revision, timestamp: sources[0].timestamp,
  sources: sources.map(source => ({ file: source.file, cases: source.results.length })), failures, tokenFloors, systemChecks, cases }, null, 2));
console.log(`${results.length} captured cases; ${failures.filter(failure => !failure.recovered).length} unresolved runner failures`);
