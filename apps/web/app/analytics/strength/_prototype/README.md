# PROTOTYPE — "Progress as a short, verifiable story" (screens 07–08)

> Throwaway. Not production. No tests, stub data, minimal abstraction. Delete this
> whole folder + the `?variant=` guard in `../page.tsx` once a direction is chosen.

## The question

What should the strength-progress "story" surface look like? A strong headline tied to
the selected exercise + range (e.g. _"Pull-ups: 2 more reps at the same added weight"_),
a compact comparison of the two performances behind it, a small chart with units, and a
way to inspect the source sessions — in a restrained editorial layout.

## The finding it forces (data, not just pixels)

The real Strength Analytics read model carries only a **single Estimated-1RM scalar per
session** (`{date, estimated_1rm}`). That scalar has already collapsed reps and Load into
one number, so it **cannot** express "same added weight, +2 reps". This surface needs a
new **comparison model** — proposed in `progress-story-data.ts` (`ProgressStory`):

- A story is pinned to **one load dimension** (added-weight / absolute-weight /
  assisted-load / bodyweight-reps / timed-hold) with **one unit**.
- The two compared performances **hold one axis equal** and move exactly the other —
  that equality is what makes the claim verifiable.
- When no single-axis comparable pair exists (both weight and reps moved), the story
  degrades to `headline: null` with an honest note — never a fabricated number.

This structurally enforces the CLAUDE.md invariant: _never combine bodyweight, added
load, assisted load, timed holds, and repetitions as if they were interchangeable._ Walk
all six stub stories (pill row up top) to confirm units/dimensions never mix.

## Run it

```bash
cd apps/web && npm run dev
# then open (no backend / Clerk needed — the guard short-circuits to stub data):
#   /analytics/strength?variant=A
```

- Bottom floating bar (or ← / →) switches **layout variant**: A / B / C.
- Pill row up top switches **exercise/story** (`?story=`), covering every load dimension
  plus the incomparable (Bench Press) degrade case.

## The variants

- **A — Headline & Ledger:** magazine headline + cyan accent line, a THEN→NOW ledger,
  compact bar chart. Type-forward.
- **B — Split Accent:** vertical accent rail carries the claim; the line chart is the
  hero on the right with the two endpoints annotated. Chart-forward.
- **C — Inline Strip:** compact, reads like an upgraded trajectory tile — claim + delta
  chip, an "A → B" comparison, and an axis-free sparkline. Most restrained.

## Capture / cleanup

Fold the winning layout into the real screen properly (with tests, real comparison model
wired through a repository/view-model), then delete this folder and the guard. The full
variant set lives on the throwaway branch as the primary source — don't leave it in main.
