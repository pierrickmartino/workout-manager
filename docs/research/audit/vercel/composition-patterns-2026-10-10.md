# Vercel composition patterns audit: `apps/web`, 10 October 2026

**Audit date:** 10 October 2026. **Reviewed:** `docs/vercel-react-audit` at `a20995e`
(main `0ec56f0` plus audit docs only). **Skill:** `vercel-composition-patterns`
(`.claude/skills/vercel-composition-patterns/`). Its rules cover component
architecture, state management, implementation patterns and React 19 APIs.

**Method.**
- Counted the boolean and optional props on every component in `components/`.
- Read each component that has more than two such props, and each prop that switches
  behaviour rather than holding state.
- Swept for `forwardRef`, `useContext`, `<Ctx.Provider>` and `renderX` props.
- Read the contexts and their consumers.
- Followed each candidate prop to its callers.

All findings are from reading the code (no runtime measurement is relevant).

## Summary

Composition here is mostly in good shape. The React 19 rules are already enforced by a
guard, and the shared primitives that needed it are already compound components. The
remaining issues are in the large feature components:

| ID | Finding | Rule | Impact | Effort |
| --- | --- | --- | --- | --- |
| C-1 | `HandAuthoredSessionForm` (1,103 lines, over the 800-line limit) serves two flows through a `mode` prop with branches throughout | `patterns-explicit-variants`, `architecture-avoid-boolean-props` | **Medium-high** | M |
| C-2 | `PrescriptionFieldStack` has 30 props. Whether an optional handler is present silently decides which controls render, and per-surface flags (`showRest`, `suppressWarmUpSummaryChip`) tune the rest | `architecture-compound-components`, `architecture-avoid-boolean-props` | **Medium** | M (needs a design pass) |
| C-3 | `PrescriptionFieldStack.advancedNonDefault` is a dead prop: no caller passes it | `architecture-avoid-boolean-props` (YAGNI) | Low | XS |
| C-4 | `ReferenceAtlasFigure` takes `interactive={false}` plus an empty `onSelectMuscle` and `selectedMuscle={null}` for the empty state | `patterns-explicit-variants` | Low (pairs with web audit V-3) | S |

## What is already right (no action)

- **React 19 APIs (`react19-no-forwardref`):**
  - There is no `forwardRef` anywhere.
  - Every context is read with `use()` and provided by rendering the context object
    itself.
  - Enforced by `lib/context-api-policy.ts` (ADR-0110).
- **Compound components (`architecture-compound-components`):**
  - `components/pulse/action-sheet.tsx`, `field-control.tsx` and `set-entry.tsx`
    already share state through a context (ADR-0105–0107), so callers compose parts
    instead of setting flags.
- **Decoupled state (`state-decouple-implementation`, `state-context-interface`):**
  - The builder's `components/builder/prescription-draft-context.tsx` exposes
    `dispatch(event)` over a typed event union.
  - The rows send events and never see how the draft is stored.
- **Children over render props (`patterns-children-over-render-props`):**
  - There are no `renderX` props.
  - Extension points are `ReactNode` slots (`PrescriptionFieldStack`'s `advanced` and
    `preview`), which is the recommended shape.
- **Explicit variants for primitives:** `components/ui/*` styles variants through `cva`
  (`variant`, `size`) rather than boolean flags.
- **State props are not a finding:** most boolean props in the sweep (`pending`,
  `disabled`, `selected`, `isFavorite`, `isFinishing`, `canMoveUp`) describe *state*,
  not *which variant to be*. The rule targets the second kind.

## Findings

### C-1: `HandAuthoredSessionForm` is two forms behind a `mode` prop (Medium-high)

**Where:** `components/HandAuthoredSessionForm.tsx`, 1,103 lines.
- `mode: "authorAndLog" | "planOnly"` is turned into a `planOnly` boolean at `:345`.
- That boolean branches the date field (`:628`), the submit path (`:557`) and the
  submit label (`:764`).
- It is passed down again as `showPerformedSets={!planOnly}` (`:702`, `:740`), which
  hides the whole "sets performed" half (`:976`).
- The callers:
  - `/sessions/log` uses `authorAndLog`.
  - `/sessions/build` and `/history/[id]/capture` (ADR-0044) use `planOnly`; capture
    also passes a `seed`, which only means something in that mode.

**Why it matters:**
- This is the shape the rule warns about. Every new difference between the flows
  becomes another `planOnly ?` branch, and the prop combinations that make no sense
  (`seed` with `authorAndLog`) are allowed by the type system.
- The file is past the repo's 800-line maximum (CLAUDE.md, *Conventions*).
- Plan-only vs log-a-performance is the domain's plan-vs-record split (CONTEXT.md), so
  each variant should state which side it writes.

**Fix:**
1. Pull out the shared exercise-list editor: exercise rows, the plan editor, Superset
   grouping, reorder and draft recovery. Its slot for each row's record half is a
   `children` / `ReactNode` slot.
2. Compose two explicit forms:
   - `LogHandAuthoredSessionForm`: plan plus first performance, with the date and the
     performed-sets section in the slot.
   - `PlanHandAuthoredSessionForm`: plan only, taking an optional `seed`, with no
     record half.
   Each owns its submit action and label.
3. Keep the pure payload builders in `lib/` (`buildAuthorSessionRequest`, unchanged)
   and their tests.
4. Callers choose a component instead of a `mode`. The `mode` prop and
   `showPerformedSets` disappear.

**Check:** the three routes render the same DOM as before, the existing `lib/*.test.ts`
tests stay green, and each new file is under 800 lines.

### C-2: `PrescriptionFieldStack`'s 30-prop interface (Medium, needs a design pass)

**Where:**
- `components/prescription/PrescriptionFieldStack.tsx:99-183`: 30 props, 3 callers
  (`AddExerciseButton` "Insert", `HandAuthoredSessionForm`,
  `builder/prescription-editor.tsx`).
- **Handlers as hidden booleans:** whether the optional `onChangeTargetEffort` and
  `onChangeNote` are passed decides whether those controls render at all (comments at
  `:118-131`, `:153-160`).
- **Per-surface flags:** `showRest` (false for a grouped Superset member) and
  `suppressWarmUpSummaryChip` (true where a Session Section band already says
  "warm-up", ADR-0074).

**Why it matters:**
- Each new prescription field adds a value prop, a handler prop and, often, a rule
  about whether it is shown.
- Surfaces opt out by *leaving a prop out*. A forgotten handler drops a control
  silently, and nothing in the types says so.
- This is what the compound-component rule addresses.

**Fix to evaluate:**
- **Option A, compound (full):**
  - `<PrescriptionFields value={…} onChange={…}>` provides the draft through `use()`.
  - Each surface lists the fields it authors as children: `<PrescriptionFields.Quantity/>`,
    `<PrescriptionFields.Rest/>`, `<PrescriptionFields.Load/>`, then
    `<PrescriptionFields.More>` holding `<PrescriptionFields.TargetEffort/>`,
    `<PrescriptionFields.Note/>` and `{advanced}`.
  - Showing or hiding a control becomes whether the child is present.
  - The catch: the summary chips (ADR-0067, CONTEXT "Prescription Summary") are built
    from the fields present, so the root has to know which children are mounted.
    Either declare them in a typed `fields` list on the root, or keep the chips
    computed from the value plus a declared field set.
- **Option B, explicit field set (smaller):**
  - Replace the handler-presence and per-surface booleans with one typed
    `fields: ReadonlySet<PrescriptionField>`, or one preset per surface (Insert,
    hand-authored, builder).
  - Pass one `onChange(patch)` instead of eleven `onChangeX`.
  - This keeps the current render tree and makes each surface's choice explicit and
    testable in `lib/`.
- Either option touches the prescription spine's display (ADR-0069 lists the fields).
  Write a short ADR, and add a `lib/` test that each surface's field set matches its
  authorship partition.

### C-3: Dead `advancedNonDefault` prop (Low)

**Where:** `PrescriptionFieldStack.tsx:177`, default `false` at `:214`, read at `:264`.
No caller passes it. Its own comment (`:170-176`) explains that no surface's `advanced`
slot holds a hidden value any more.

**Fix:** delete the prop, its default and its term in the open-on-mount condition.
This is behaviour-neutral, because it is always `false`.

### C-4: Atlas figure's empty-state boolean (Low)

**Where:**
- `components/analytics/muscle-region-atlas.tsx:71-79` renders `ReferenceAtlasFigure`
  with `interactive={false}`, `onSelectMuscle={() => {}}` and `selectedMuscle={null}`.
- `reference-atlas-figure.tsx:141-175` checks `interactive` about ten times (role,
  tabIndex, aria-pressed, handlers, class).

**Fix:**
- Split it into a `StaticAtlasFigure` that takes no handlers or selection, used for
  the empty state, and the interactive figure, which composes it and adds the overlay
  behaviour.
- The static one needs no client state, so it can be a Server Component. That is a
  step towards the web audit's
  [V-3](react-best-practices-2026-10-10.md#v-3-the-atlas-ships-every-figures-path-data-to-the-client-medium),
  which sends less atlas path data to the client.

## Considered and not recommended

- **A context for the Live Session set list:**
  - `LiveSessionSets` receives nine props, including five callbacks, from
    `LiveSessionScreen` (`:644`).
  - A context with `dispatch` would cut the props down. But the component is
    deliberately memoized, with every prop's identity kept stable
    (`live-session-sets.tsx:48-58`), on the app's most re-render-sensitive screen.
  - A context value would need the same care, so the swap gains nothing. Keep it as is.
- **`SessionCard.claimsSigilMorph` and `TopSetTrendChart.showValues`:**
  - Each is one opt-in boolean with a single caller-side meaning (view-transition
    ownership, ADR-0118+; a compact chart tile).
  - Splitting them into variants would add components without removing branches.
