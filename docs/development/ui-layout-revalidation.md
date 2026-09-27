# Split-fixture layout re-validation

Date: 2026-09-27. Issue: [#562](https://github.com/pierrickmartino/workout-manager/issues/562),
part of [#558](https://github.com/pierrickmartino/workout-manager/issues/558).
Application base: `d3bf914727d9bd4747a9787714f4f0d6a5cef5f7`; branch: `main`.
Session: Codex, existing GPT-6 model. Dependencies #560 and #561 were closed and
present before capture. No production layout changes are included.

**Outcome:** a spaced Exercise name alone overflows creation. Logging, Live
Session and Atlas contributors overflow only with the unbroken Exercise name.
Long Session names alone cause no page overflow in these fixtures. History
already overflows with short names. Replacing Fontsource with production font
payloads changes none of the paired document widths.

## Evidence and method

[Runner instructions](../../apps/web/audit/README.md),
[summary](ui-layout-revalidation-evidence/summary.json),
[raw measurements](ui-layout-revalidation-evidence/results.json.gz),
[font provenance and hashes](../../apps/web/audit/production-fonts/manifest.json).

The complete matrix contains **4,224 unique successful captures**: 2,304 on
production fonts and 1,920 paired Fontsource controls. Chromium 153.0.8010.12 and
Playwright WebKit 26.6, macOS, Node 24.19.0. Both engines cover six Skins × two
explicit Modes × two simulated orientations (320×568 and 568×320 CSS px).
The summary's `matrixComplete` check verifies capture counts, uniqueness,
48 captures per journey/input, 48 completed cards, 48 Accent samplers (36
measurements each), and 48 cases per drawer/input. Browser zoom is 100%.

Each of eight journeys mounts five **separate** inputs: short names; a spaced
120-character Session name; 120 unbroken `W`s as a Session name; a spaced
100-character Exercise name; and 100 unbroken `W`s as an Exercise name. Exact
strings are retained in raw `fixtureDefinitions` and the fixture source.
A case changes only its selected name axis. Author/profile names and the footer
stay short, and no spaced/unbroken pair shares a case. Session names have no
visible effect in journeys that do not display them. Drawer checks separately
use short, spaced Exercise and unbroken Exercise names.

Every width is identified by engine/Skin/Mode/viewport/fixture/journey/state.
Each default capture has a Fontsource control on identical current code, data
and viewport. **All 1,920 document-width comparisons have a zero delta.** This
retires the font-width asterisk without claiming font files are interchangeable
or that unmeasured line heights/internal widths are identical.

All seven production font families are explicitly loaded before inspection;
fallback-only resolution fails the runner. The 45 payloads initially extracted
from the app's Next development loader were verified byte-for-byte against a
successful `next build --webpack`. The checked-in snapshot now uses that
production build's emitted faces, fallback metrics, variable declarations and
payloads, with SHA-256 hashes and font licenses. Raw results record the loaded
families. This is app build output, not substituted font packages or a deployed
site capture. Fontsource is used only in explicitly labelled controls.

## Attributed layout results

Cells show the **maximum portrait document width**, followed by the number of
cases overflowing across both orientations out of 48 (two engines × six Skins ×
two Modes × two orientations). All landscape widths and individual overflowing
case identifiers remain in the summary. Maxima vary by Skin typography, so they
must not be read as PULSE-only measurements.

| Journey | Short | Session spaced | Session unbroken | Exercise spaced | Exercise unbroken |
| --- | ---: | ---: | ---: | ---: | ---: |
| profile | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) |
| sessions | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) |
| history | 340px (24/48) | 340px (24/48) | 340px (24/48) | 340px (24/48) | 340px (24/48) |
| catalog | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) |
| creation | 320px (0/48) | 320px (0/48) | 320px (0/48) | 789px (48/48) | 1848px (48/48) |
| logging | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 1562px (48/48) |
| live | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 1589px (48/48) |
| analytics | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) | 320px (0/48) |

Under #558's conformance-first scale:

- **Creation: P1 reflow finding on spaced input.** The spaced Exercise fixture
  reaches 789px and overflows all 48 cases. Unbroken names reach 1,655–1,848px,
  depending on Skin. The old finding's attribution solely to unbroken names was
  unsupported; this run proves a spaced name alone is sufficient.
- **History: P1 reflow finding independent of long names.** All five inputs
  overflow every portrait case (338–340px at 320px); landscape fits. This remains
  a header action-cluster finding rather than a name-format finding.
- **Logging and Live Session: P3 hardening for unbroken input.** Neither spaced
  Exercise names nor either long Session name causes page overflow. Unbroken
  Exercise names overflow all 48 cases: logging reaches 1,397–1,562px and Live
  Session 1,424–1,589px. No spaced-name reflow failure is established here.
- **Atlas drawer: P3 hardening for unbroken input.** Short and spaced Exercise
  names fit in every case. Unbroken names push contributor text and counts beyond
  the viewport in all 48 cases (right edge up to 1,540.27px). Its document width
  stays equal to the viewport because the fixed drawer contains the overflow;
  reporting document width alone would miss this finding.
- **Profile, Session library, Catalog and closed Analytics:** no document
  overflow with any split input. The Catalog drawer also has no document or
  element overflow for any of its three inputs. These observations do not retire
  the original profile-value clipping or Session-title abbreviation concerns;
  those are different properties from document reflow.

For direct comparison with the archive, PULSE Light portrait remains 338px in
History, 1,655px in creation with the unbroken Exercise fixture, 1,397px in
logging and 1,424px in Live Session. The newly isolated creation spaced case is
789px. Differences between these PULSE figures and the table maxima are Skin
metrics, not production-versus-Fontsource deltas.

## Composited text and retuned Accents

All 48 completed-card captures retain composited foreground/background colours
and both note ratios under `completedNotes`. The prescription note measures
**4.91–6.28:1**, passing normal-text AA throughout the matrix after #560.
Completed state is activated through the actual button's DOM click because
sticky chrome can intercept pointer input in the short landscape viewport. This
measures the resulting card; it does not establish landscape pointer access.

The Previous-attempt note measures **3.88–7.68:1**; **28 of 48** captures fall
below 4.5:1. Under the same scale this is a remaining P1 application contrast finding, distinct from the
prescription-note acceptance check and from runner failures. It is recorded,
not fixed, by this evidence issue.

The 48 rendered Accent samplers retain all six flat Accents on each of three
surfaces, five applicable self-tints, and the primary button label: **1,728
samples**, minimum **4.60006:1**. All clear the 4.6 floor. Resolved token colours
are also retained. For example, PULSE Light cyan now renders as `#066d7d`:
6.01:1 on base, 5.47:1 on elevated, and 4.62:1 on its elevated tint. These replace
the original 3.75, 3.41 and 2.97 ratios. Vercel's current cyan is `#005dc9` in
Light and `#258aff` in Dark. The
[static matrix and retuning evidence](contrast-floor-handoff.md) remain primary
for the exhaustive token invariant; this run adds in-situ solid compositing.

## Runner outcomes and limits

Eleven Chromium fixture-load timeouts occurred with the original 5-second wait.
All were retried with a 15-second wait and recovered; **zero unresolved runner
failures** remain. Original errors stay in raw `failures`; the summary marks each
`recovered: true`. They are not rated as application findings. Initial sandbox
launch/bind restrictions and the landscape activation stall were setup attempts,
excluded from the completed sweep. The latter explains the DOM-activation limit
above; pointer accessibility is not claimed.

Contrast inspection retains unresolved gradients/images/filters/backdrop blur
and blend modes rather than scoring them. Ordinary text is checked at 4.5:1 and
qualifying large text at 3:1 using computed size/weight. The Accent sampler uses
normal text, not a large-text exemption. No full interaction-state inventory,
authenticated fetching, Clerk UI, physical rotation, installed safe areas, real
Safari browser zoom, or 200%/large-data matrix re-run is established here.

## Validation and handoff

- `node audit/revalidate.mjs`, then `UI_AUDIT_RESUME=1 node audit/revalidate.mjs`:
  4,224 successful unique captures; 11 recovered errors, none unresolved.
- `node audit/summarize-revalidation.mjs`: matrix complete, no font-width deltas.
- `npx tsc --noEmit`: passes.
- Focused Skin matrix/guard tests: 15 pass. Full `npm test`: 1,293 pass.
- `npm run build -- --webpack`: production build passes; 45/45 font bytes match.
- `AI_MODEL='' .venv/bin/pytest` in `apps/api`: 2,636 pass. The first run's seven
  provider-default failures were caused by a local AI_MODEL override; the 20
  affected-file tests pass with that setting cleared. No backend code changed.

Review compared the staged work with the fixed application base above against
#562 and `REVIEW.md`, along separate Standards and Spec axes. Standards review
found mutable audit bookkeeping and a resume-provenance concern; both were fixed
and rechecked. Six focused browser capture paths preserved document widths and
completed prescription ratios after those changes; the public CLI rejected an
incompatible resume revision. Final Standards result: one accepted advisory
about repeated fixture/configuration definitions, no documented breach or
security blocker. Spec result: zero findings; all ten criteria satisfied. Layout remediation,
Previous-note contrast remediation and the broader #558 evidence rewrite remain
separate work. The archive below remains intact for historical interpretation.

## Changelog from the original audit

This report supersedes the **layout input attribution, font-payload limitation,
and completed-card/rendered-Accent measurements** in the
[original report](ui-layout-validation.md). Its raw captures and screenshots are
retained unchanged. The original mixed-fixture widths remain valid historical
page maxima, but cannot identify which input caused them. The newly separated
cases establish that distinction. The original P2 layout priorities are replaced
above using #558's stated scale; the original faded-card and Accent ratios are
superseded by measurements after #560/#561. Zoom and large-data evidence are not
replaced by this run.
