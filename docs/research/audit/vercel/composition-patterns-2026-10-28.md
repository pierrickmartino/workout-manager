# Vercel composition patterns audit: `apps/web`, 28 October 2026

**Audit date:** 28 October 2026. **Reviewed main:** `1bd31f4`. **Skill:**
`vercel-composition-patterns` (`.claude/skills/vercel-composition-patterns/`). Its rules
cover component architecture, state management, implementation patterns and React 19 APIs.

**Context.** This is a follow-up to the 10 October audit (`2692048`, removed from the tree
in `8c252dd`; read it with
`git show 8c252dd^:docs/research/audit/vercel/composition-patterns-2026-10-10.md`). Its
C-1 to C-4 are fixed (`43df523`):
- `HandAuthoredSessionForm` became `LogHandAuthoredSessionForm` and
  `PlanHandAuthoredSessionForm` over a shared exercise list.
- `PrescriptionFieldStack` takes one `controls` preset and one `onChange` (ADR-0129).
- The dead `advancedNonDefault` prop is gone.
- The atlas has a separate `StaticAtlasFigure`.

New findings are numbered from C-5.

**Method.**
- Parsed every `.tsx` under `components/` and `app/` with the TypeScript compiler API and
  listed, for each component's props, the `boolean` members, the literal-union (mode)
  members, the optional function members and any `renderX` member. This covered named
  `*Props` types and the 160 components typed inline in their signature.
- Read every component with more than two such props, every file over 400 lines, and each
  candidate prop's callers.
- Swept for `forwardRef`, `useContext`, `.Provider`, function-as-children and
  `createContext`.
- Checked that every form that edits part of a Logged Set composes from `pulse/set-entry.tsx`
  (ADR-0106).

All findings are from reading the code; no runtime measurement is relevant.

## Summary

The component APIs are in good shape. The largest props interface is 12 props. Almost every
boolean holds *state* (`pending`, `selected`, `canMoveUp`, `locked`), not a variant choice.
There are no `renderX` props or function children, and the React 19 rules hold. The
findings are one compound family that a refactor bypassed, and two large components that
branch where they could compose:

| ID | Finding | Rule | Impact | Effort |
| --- | --- | --- | --- | --- |
| C-5 | The hand-authored Log form's `PerformedSetsEditor` re-implements the Logged Set fields (amount by kind, Load, RPE) instead of composing `SetEntry`. It is a fifth copy that ADR-0106 set out to remove, and it has already drifted | `architecture-compound-components`, `patterns-explicit-variants` | **Medium** | S → M |
| C-6 | `LiveSessionScreen` (836 lines, over the 800-line limit) is four screens behind a `phase` state, with the live screen's sticky bar inlined | `patterns-explicit-variants` | Medium-low | M |
| C-7 | Session detail's `PrescriptionCard` takes `showScheme`, `showRemove`, `canRemove` and `dissolvesSuperset`: one standalone-vs-member choice spread over four props | `architecture-avoid-boolean-props`, `patterns-children-over-render-props` | Low | S |

## What is already right (no action)

- **React 19 APIs (`react19-no-forwardref`):** no `forwardRef` or `useContext`, and no
  `.Provider`. Enforced by `context-api-policy.ts` (ADR-0110).
- **Compound components:** the five contexts are unchanged (`ActionSheet`, `FieldControl`,
  `SetEntry`, `PrescriptionDraft`, `NavigationGuard`). The new screens compose them: the
  Session actions sheet, `FavoriteSheetItem`, and the facet rails built on `pulse/facet-rail`.
- **Context interface (`state-context-interface`, `state-decouple-implementation`):**
  `ProtocolBuilder` sends every Prescription edit as one `dispatch(event)` (ADR-0105).
  `PrescriptionFieldStack` now receives a declared `controls` preset and a single `onChange`
  (ADR-0129), so a surface can no longer opt out by leaving a handler off.
- **Explicit variants from C-1:** `LogHandAuthoredSessionForm` (180 lines) and
  `PlanHandAuthoredSessionForm` (119 lines) are explicit variants over
  `hand-authored-exercise-list.tsx`, whose card takes the record half as `children`.
- **Children over render props:** no `renderX` and no function children. Optional regions
  are `ReactNode` slots (`advanced`, `preview`, `children`), per ADR-0109.
- **Booleans that are fine by ADR-0109** ("a flag for a detail inside the component's own
  rendering is fine"): `LoggedSetTable.showBodyWeight` (the record detail shows the BW
  stat), `EquipmentSymbol.showOverflowCount`, `Avatar.silhouette` (a locked option), and
  `SessionCard.claimsSigilMorph` (kept, as on 10 October).

## Findings

### C-5: the hand-authored Log form bypasses `SetEntry` (Medium)

**Where:** `components/hand-authored/performed-sets-editor.tsx` (144 lines) is the record half
of the `/sessions/log` card. It was extracted by C-1 from the old `HandAuthoredSessionForm`,
which never composed `SetEntry` either: there were 0 references at `d604f5f`. It references
`SetEntry` 0 times. The other four Logged Set editors do: `AdhocLogForm` 11,
`LogSessionForm` 11, `CorrectLogForm` 27, `live-session-sets` 14.

**What it re-implements:**
- **The amount, by Quantity kind:** an `isDistance ? … : isDuration ? … : reps` branch over
  raw `Input`s, which is the three-way branch ADR-0106 says was "written four times" and
  moved into `SetEntry.Quantity`.
- **The Load:** its own `LoadValueInput` block.
- **The effort:** a bare `type="number" min={1} max={10}` RPE input.

**The drift ADR-0106 predicted has already happened here:**
- **Effort:** the other four forms use `SetEntry`'s effort picker, with its scale (RPE or
  RIR) and values. This one accepts only a 1–10 RPE number, typed freehand.
- **Set Note:** the other forms offer `SetEntry.Note`; this one has no note field.
- **Placeholders:** distance `5`, time `mm:ss`, hold `0:45`. ADR-0106 records the same
  placeholder drift (`25:00` / `5:00`) as one of its reasons.
- **Accessible names:** `Set 1 distance for Back Squat`, `Set 1 hold time for …` and
  `Set 1 perceived difficulty for …`. `SetEntry` names them through `subject` and `prefix`,
  so the same field reads differently here than in the other forms.
- **Nothing catches it:** no guard covers it. The frontend rule ("Part of a Logged Set →
  compose from `pulse/set-entry.tsx`") is backed by `set-entry.test.ts` and
  `set-entry-fields.test.ts`, which test the family and the forms ADR-0106 merged. Nothing
  sweeps for a new copy, so a file that never imports the family passes.

**Fix:**
1. Render each performed set through `SetEntryProvider` (the rows are held in client state,
   like `AdhocLogForm`). Map through a declared row table (`SetEntryRowMap`) and compose
   `SetEntry.Quantity`, `SetEntry.Load` and the effort and note parts. Each kind then
   appears in one place again (ADR-0010, ADR-0032).
2. Check the payload builder: if `buildAuthorSessionRequest` or its `PerformedSetRow` reads
   `perceivedDifficulty` as RPE only, move it onto `LogSetInput` / `buildLoggedSets` in
   `lib/logged-set.ts` (ADR-0115: "never a per-path builder"). The effort scale and note
   then reach the record.
3. Add a guard so the sixth copy fails `npm test`: a component outside `pulse/set-entry.tsx`
   that renders `LoadValueInput`, or an effort-range input, is reported. Alternatively, list
   the Logged Set editors in `set-entry.test.ts` and make the list fail closed on a new file
   that imports `logs-types` set rows.
4. Add a line to ADR-0106 naming the fifth editor.

**Check:** the existing `lib/*.test.ts` stay green; a new test pins that a hand-authored log
posts an effort scale and a note; `/sessions/log` passes the `reflow` journey at 320px.

### C-6: `LiveSessionScreen` is four screens behind a `phase` (Medium-low)

**Where:** `components/LiveSessionScreen.tsx`, 836 lines, unchanged since 10 October and over
the repo's 800-line maximum (CLAUDE.md, *Conventions*).
- One component owns a `useReducer` for the session, six `useState`s (`phase`, `summary`,
  `finishState`, `restEndAt`, `expandedUnits` and one more) and two effects.
- It returns one of four screens by `phase`: `deciding` (`:486`), `blocked` (`:504`),
  `summary` (`:518`), and the live screen (`:530-693`, about 160 lines of JSX). The live
  screen includes the sticky bar, which itself swaps between a rest countdown and the
  elapsed timer.
- `BlockedPrompt` and `IdleEndedSummary` are already extracted, at the bottom of the file.

**Why it matters:** every new phase or bar state becomes another branch in the same
function, and a reader has to hold all four screens' state to change one. The skill's answer
is explicit variants: the phase picks a component, and each screen receives only what it
renders.

**Fix:**
- Move the live screen to `live-session-live.tsx` (header, sticky bar, set list, finish).
  Extract the sticky bar as `LiveSessionBar`, with its two states as explicit children
  (`RestBar` and `ElapsedBar`) chosen by `restEndAt`.
- Keep the phase decision, the slot persistence and the finish flow in `LiveSessionScreen`,
  so it becomes the provider-like owner and the screens are renderers.
- **Constraint (ADR-0091):** this is the app's most re-render-sensitive screen. Keep the
  tick in its leaf (`ElapsedClock`, `RestCountdown`), and keep every prop reaching the
  memoized `LiveSessionSets` stable. `live-session-tick.test.ts` must stay green. Don't
  introduce a context value here: the 10 October audit rejected it for the same reason.

**Check:** each file under 800 lines, `live-session-tick.test.ts` and
`live-set-table-card.test.ts` green, and the Live Session renders the same DOM per phase.

### C-7: `PrescriptionCard`'s four flags (Low)

**Where:** `app/sessions/[id]/page.tsx:294-306` passes, and `:327-353` declares:
- `showScheme={!(session.is_protocol_member ?? false)}`, which renders the `SchemeControl`
  (`:435`).
- `showRemove`, `canRemove` and `dissolvesSuperset`, from
  `removeAffordanceList[index]`. The first decides whether the ⋯ sheet renders at all
  (`:454`); the other two are forwarded unchanged to `RemoveExerciseButton`.

**Why it matters:**
- `showScheme` and `showRemove` are false for the same reason, a Protocol member (ADR-0052,
  ADR-0064). The card re-derives "standalone or member" from two booleans, and nothing stops
  a caller from passing a combination that means nothing (a scheme with no Remove sheet).
- Two of the four props pass through a component that never reads them.

**Fix:** let `PrescriptionList` compose what it already decides, through slots:

```tsx
<PrescriptionCard … scheme={standalone ? <SchemeControl … /> : null}>
  {affordance.showRemove ? (
    <ActionSheet …><RemoveExerciseButton … {...affordance} /></ActionSheet>
  ) : null}
</PrescriptionCard>
```

The card then renders `scheme` and `children` without knowing why they are there (ADR-0109),
and the four booleans go. Alternatively, pass the one `affordance` object instead of its three
fields. That is a smaller change, but it keeps the flag.

## Considered and not recommended

- **One row component for the Builder and the hand-authored exercise list:** both render a
  Prescription row with reorder, group and remove. But the Builder's rows drag (`@dnd-kit`)
  and dispatch events into a draft context (ADR-0105), while the hand-authored card is one
  level below its owner and uses buttons. The field controls are already shared through
  `PrescriptionFieldStack` presets (ADR-0129). Merging the row chrome would bring drag
  machinery to the simpler form for no user-visible gain.
- **A context for `ExerciseCard`'s six callbacks** (`hand-authored-exercise-list.tsx:170`):
  the card is one level below the list that owns the state. The frontend rule puts a
  context at "three components away from its control", so props are right here.
- **`ProtocolBuilder`'s `ConfigPanel` (10 props):** values plus three `dispatch` wrappers
  from one owner, rendered once. It is not a variant problem.
- **`LiveSessionSets`' nine props:** unchanged since 10 October, and still deliberately
  memoized.
