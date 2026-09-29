# 320px reflow remediation

Date: 2026-09-29. Issue: [#570](https://github.com/pierrickmartino/workout-manager/issues/570),
remediating rank 2 of the [28 September audit](../research/audit/2026-09-28.md).
Application base: `dfdd90af39b9046ee19aab31e4f8e37bcc9549ba`; branch `fix/320px-reflow`.
Governed by [ADR-0085](../adr/0085-a-narrow-screen-never-scrolls-sideways.md).

**Outcome:** zero document overflow at 320px in all 600 cases at 100% text,
including the two journeys the recorded matrix never covered. 240 of 600 cases
still overflow at 200% text, from a different defect that is named and left open.

## Evidence and method

[Summary](ui-reflow-evidence/reflow-summary.json),
[raw measurements](ui-reflow-evidence/reflow-results.json.gz).
Runner: [`audit/reflow.mjs`](../../apps/web/audit/reflow.mjs), against the
isolated audit server (`npm run audit:serve`).

600 cases: 10 journeys × 6 Skins × 2 Modes × 5 name fixtures × 2 text scales, at
a 320×568 portrait viewport. The journeys mount the same `audit/main.tsx`
components as the recorded matrix, against the same `audit/fixtures.ts` names, so
the numbers sit beside [the split-fixture
matrix](ui-layout-revalidation.md) rather than describing a second fixture set.

Two journeys are tagged `novel` because the recorded matrix never captured them:

- **`correction`** was mountable all along but was not among the eight swept. It
  holds five content-floored grids.
- **`creation-logged`** is the Hand-Authored form in its default `authorAndLog`
  flow. Every recorded creation capture used `mode="planOnly"`, which hides the
  "SETS PERFORMED" half — so that grid had never rendered in any capture.

The runner gates on **document** overflow and records **element** overflow
without gating. The Atlas drawer taught the earlier matrix that a fixed container
hides element overflow from the document width; that defect is a different shape
and stays out of scope, but it is measured rather than invisible.

**Engine boundary:** Chromium only (Playwright build 1194 via an explicit
`executablePath`; the repo's pinned build is not present in this container).
WebKit is **not installed**, so the two-engine criterion is half-met. Widths are
not expected to match the recorded matrix exactly, which ran Chromium 153 on
macOS — the *defects* reproduce, the rasterisation differs by about a pixel.

## Baseline, then result

`UI_REFLOW_BASELINE=1 node audit/reflow.mjs` against unmodified `main` reproduced
every recorded defect before any fix was written (the runner fails if it does
not, because a clean baseline means it is not looking at the right thing).

| Journey | Recorded matrix | Baseline here | After |
| --- | ---: | ---: | ---: |
| history (all five fixtures) | 338–340px, 24/48 | 340px, 12/12 | **320px, 0/12** |
| creation, Exercise spaced | 789px, 48/48 | 789px, 12/12 | **320px, 0/12** |
| creation, Exercise unbroken | 1,848px, 48/48 | 1,847px, 12/12 | **320px, 0/12** |
| logging, Exercise unbroken | 1,562px, 48/48 | 1,562px, 12/12 | **320px, 0/12** |
| correction, Exercise unbroken | not captured | 1,545px, 12/12 | **320px, 0/12** |
| creation-logged, Exercise spaced | not captured | 789px, 12/12 | **320px, 0/12** |

Totals at 100% text: **132 of 600 cases overflowing before, 0 after.**

One divergence from the recorded matrix, reported rather than claimed: **Live
Session does not reproduce its recorded 1,589px / 48-of-48 unbroken-name
overflow** on this revision and container. It measured 320px with zero element
overflow at baseline, before any change here. The recorded figure is not
withdrawn — a different capture state is the likely explanation — but this run
cannot confirm it, and none of the work below is credited with fixing it.

## What changed

| Site | Change |
| --- | --- |
| `pulse/page-header.tsx` | `flex-wrap` on the header, `shrink-0` dropped from the action slot, `min-w-0` on the title column |
| `HistoryBrowser.tsx:94` | `flex-wrap` on the action cluster, so link and badge can split |
| `builder/session-composition-strip.tsx:308` | `truncate` → `break-words`; the tile shows the whole name |
| six `<fieldset>`s | `min-w-0` (`ProfileForm` ×2, `CorrectLogForm`, `HandAuthoredSessionForm`, `LogSessionForm`, `AdhocLogForm`) |
| `HandAuthoredSessionForm.tsx:877` | `min-w-0 break-words` on the exercise heading; `flex-wrap` on its row and its control cluster |
| `LogSessionForm.tsx:189`, `CorrectLogForm.tsx:184`, `live-session-sets.tsx:210` | `min-w-0 break-words` on the exercise name |
| `live-session-sets.tsx:291` | `flex-wrap` on the Complete/Skip cluster |

The last four rows are the P3 unbroken-name family. They were not named by the
finding; they are here because the same two rules reached them, and excluding
them would have been artificial. The Atlas drawer stays out: its overflow is
element-level inside a fixed container, a different shape.

## Guard

[`reflow-policy.ts`](../../apps/web/lib/reflow-policy.ts) sweeps every `.tsx`
under `components/` and `app/` in the existing `web` job (`npm test`). It
reproduced all **six** pre-fix `fieldset-min-width` violations — including
`HandAuthoredSessionForm.tsx:654`, the measured root cause — and reports none
after. `pulse/field.tsx` was correctly never flagged: it already had the class.

The registry ships **empty**. ADR-0085 records why two further patterns were
dropped from the guard rather than exempted: a `nowrap` value and a `shrink-0`
child of a rigid row are not decidable from a class string, and flagging them
produced 77 findings, nearly all false.

## Validation

- `UI_REFLOW_BASELINE=1 node audit/reflow.mjs`: defects reproduced, 132/600.
- `node audit/reflow.mjs`: 0/600 at 100% text, 0 capture failures, exit 0.
- `npm test`: 1,361 pass, 0 fail (12 new).
- `npx tsc --noEmit`: passes.
- Before/after screenshots at 320px, PULSE light and dark, on the pull request.

## Open, not closed

1. **200% text.** 240 of 600 cases overflow, all `rem`-sized grid tracks in form
   field rows — `grid-cols-[7rem_1fr]` is a 224px fixed column once the root font
   doubles; the measured culprits are 224px, 160px and 128px columns in
   `logging`, `live`, `correction` and `creation-logged`. Fixing it means those
   rows stack at narrow widths: a redesign of four forms, its own issue.
   Those four are a named ratchet (`KNOWN_200_TEXT_OVERFLOW`) rather than a
   silent exclusion — every other journey must pass at 200%, and an entry that
   stops overflowing fails the run, so the list can only shrink.
   **Closed since, by [#572](ui-reflow-200-text-validation.md)**: the rows wrap,
   the ratchet is gone, and 0 of 600 cases overflow at 200% text.
2. **The authenticated 200% real-app check** named in the audit's success
   criteria was not run. A doubled root font size on a fixture is not a signed-in
   phone, and this run does not stand in for it.
3. **WebKit.** Not installed; the two-engine criterion is half-met.
4. **The fifteen arbitrary `1fr` grid tracks** were left alone. After the fixes
   the measurement implicates none of them at 100% text, and converting fifteen
   call sites blind was declined in favour of measuring first.
