import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const output = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-layout-revalidation-evidence");
const evidence = JSON.parse(gunzipSync(await readFile(resolve(output, "results.json.gz"))));
const { results } = evidence;
const caseKey = result => [result.browser, result.skin, result.mode, result.width, result.height, result.fixture, result.journey, result.state, result.fonts].join("/");
const failures = evidence.failures.map(failure => ({ ...failure, recovered: results.some(result => caseKey(result) === caseKey(failure)) }));
const uniqueCases = new Set(results.map(result => [result.browser, result.skin, result.mode, result.width, result.height, result.fixture, result.journey, result.state, result.fonts].join("/")));
const expectedCaptures = 4224;
const captureMatrixComplete = results.length === expectedCaptures && uniqueCases.size === expectedCaptures && failures.every(failure => failure.recovered);
const production = results.filter(result => result.fonts === "production");
const defaults = production.filter(result => result.state === "default" && result.journey !== "contrast");
const identity = result => [result.browser, result.skin, result.mode, result.width, result.height, result.fixture, result.journey, result.state].join("/");
const controls = new Map(results.filter(result => result.fonts === "fontsource").map(result => [identity(result), result]));
const fontWidthChanges = defaults.flatMap(result => {
  const control = controls.get(identity(result));
  if (!control || control.documentWidth === result.documentWidth) return [];
  return [{ case: identity(result), productionWidth: result.documentWidth, fontsourceWidth: control.documentWidth, delta: result.documentWidth - control.documentWidth }];
});
const layout = [...new Set(defaults.map(result => result.journey))].map(journey => ({
  journey, fixtures: Object.fromEntries(["short", "session-spaced", "session-unbroken", "exercise-spaced", "exercise-unbroken"].map(fixture => {
    const cases = defaults.filter(result => result.journey === journey && result.fixture === fixture);
    const overflowing = cases.filter(result => result.documentWidth > result.viewport.width + 1);
    return [fixture, { captures: cases.length, overflowing: overflowing.length, maximumWidth: Math.max(...cases.map(result => result.documentWidth)),
      portraitMaximum: Math.max(...cases.filter(result => result.width === 320).map(result => result.documentWidth)),
      cases: overflowing.map(result => ({ case: identity(result), documentWidth: result.documentWidth, viewportWidth: result.viewport.width })) }];
  })),
}));
const drawers = ["catalog", "analytics"].map(journey => ({ journey,
  fixtures: Object.fromEntries(["short", "exercise-spaced", "exercise-unbroken"].map(fixture => {
    const cases = production.filter(result => result.journey === journey && result.state === "drawer" && result.fixture === fixture);
    return [fixture, { captures: cases.length,
      documentOverflowing: cases.filter(result => result.documentWidth > result.viewport.width + 1).length,
      elementOverflowing: cases.filter(result => result.overflow.length > 0).length,
      maximumRight: Math.max(0, ...cases.flatMap(result => result.overflow.map(element => element.right))),
    }];
  })),
}));
const completed = production.filter(result => result.completedNotes).map(result => ({
  case: identity(result), prescription: result.completedNotes.prescription, previous: result.completedNotes.previous,
}));
const accents = production.filter(result => result.journey === "contrast").map(result => ({
  case: identity(result), tokens: result.accents,
  samples: result.texts.filter(text => /^(base|surface|elevated) (cyan|blue|violet|magenta|amber|green) (flat|tint)$/.test(text.text) || text.text === "Continue"),
}));
const matrixComplete = captureMatrixComplete && completed.length === 48 && accents.length === 48
  && accents.every(result => result.samples.length === 36)
  && drawers.every(result => Object.values(result.fixtures).every(fixture => fixture.captures === 48))
  && layout.every(result => Object.values(result.fixtures).every(fixture => fixture.captures === 48));
const summary = { issue: evidence.issue, revision: evidence.revision, timestamp: evidence.timestamp,
  engines: { chromium: evidence.chromiumVersion, webkit: evidence.webkitVersion },
  matrixComplete, expectedCaptures, captures: results.length, productionCaptures: production.length, runnerFailures: failures,
  layout, drawers, fontWidthChanges, completed, accents,
  cases: production.map(result => ({ case: identity(result), documentWidth: result.documentWidth, viewport: result.viewport,
    overflowCount: result.overflow.length, overflowExamples: result.overflow.slice(0, 5),
    lowContrastCount: result.texts.filter(text => !text.disabled && text.ratio < text.threshold).length,
    unresolvedCount: result.unresolved.length })),
};
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
const table = layout.map(({ journey, fixtures }) => `| ${journey} | ${["short", "session-spaced", "session-unbroken", "exercise-spaced", "exercise-unbroken"].map(fixture => `${fixtures[fixture].portraitMaximum}px (${fixtures[fixture].overflowing}/48)`).join(" | ")} |`).join("\n");
const minimum = field => Math.min(...completed.map(result => result[field].ratio));
const accentMinimum = Math.min(...accents.flatMap(result => result.samples.map(sample => sample.ratio)));
await writeFile(resolve(output, "layout-table.md"), table + "\n");
console.log(JSON.stringify({ captures: results.length, failures: failures.length, fontWidthChanges: fontWidthChanges.length,
  completedPrescriptionMinimum: minimum("prescription"), completedPreviousMinimum: minimum("previous"), accentMinimum }, null, 2));

if (!matrixComplete) process.exitCode = 1;
