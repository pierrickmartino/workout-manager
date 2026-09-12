// PROTOTYPE — throwaway. Not production code, not imported by the real app except
// behind the `?variant=` guard in this route's page. See ./README.md.
//
// This module exists to answer a DATA question the presentation surfaces:
// "Progress as a short, verifiable story" (screens 07–08) wants a headline like
//   "Pull-ups: 2 more reps at the same added weight"
// but the real Strength Analytics read model only carries a single Estimated-1RM
// scalar per session ({date, estimated_1rm}). A scalar can't say "same added weight,
// more reps" — it has already collapsed reps and Load into one number. So the story
// needs a NEW comparison model. This file proposes its shape and feeds it stub data
// so the three layout variants have something honest to render.
//
// The load-bearing invariant (CLAUDE.md): never combine bodyweight, added load,
// assisted load, timed holds, and repetitions as if they were interchangeable. The
// model below enforces that structurally — a story is pinned to ONE load dimension
// with ONE unit, and the two compared performances hold one axis equal while the other
// moves. A comparison that can't be expressed that way degrades to `headline: null`
// with an honest note, never a fabricated single number.

// The load dimension a story is measured in. A story never spans two of these.
export type LoadDimension =
  | "added-weight" // bodyweight + external kilograms (weighted pull-up / dip)
  | "absolute-weight" // barbell / dumbbell kilograms
  | "assisted-load" // machine / band assistance in kg (less assistance = stronger)
  | "bodyweight-reps" // pure bodyweight repetitions, no external load
  | "timed-hold"; // isometric seconds

// The single axis that moved between the two comparable performances. Exactly one
// moves; the other is held equal — that equality is what makes the claim verifiable.
export type ComparisonAxis = "reps" | "load" | "assistance" | "hold-seconds";

// One of the two comparable performances. `anchorLabel` is the held-equal value (the
// thing both performances share); `movedLabel` is the value that changed, rendered
// with its unit. `chartValue` is the same moved quantity as a bare number for the
// chart. `sessionId` lets the UI link out to the source Logged Session.
export interface StoryPerformance {
  sessionId: string;
  dateLabel: string;
  anchorLabel: string;
  movedLabel: string;
  chartValue: number;
}

// One point on the story's supporting mini-chart. Only points that are comparable to
// the pair (same dimension, same held-equal anchor) appear — the chart never plots a
// heavier-but-fewer-reps session next to these as if it were on the same yardstick.
export interface StoryPoint {
  dateLabel: string;
  value: number;
  kind: "earlier" | "later" | "context";
}

// The honest degrade: when the two most recent performances moved along more than one
// axis at once (heavier AND fewer reps), there is no single-number story to tell. We
// say so plainly rather than invent one.
export interface IncomparableNote {
  reason: string;
}

// A single verifiable progress story for one exercise over one range.
export interface ProgressStory {
  key: string;
  exercise: string;
  rangeLabel: string;
  dimension: LoadDimension;
  // Human label for the dimension, used in the headline ("added weight", "bodyweight").
  dimensionLabel: string;
  axis: ComparisonAxis;
  // The unit the moved axis is measured in ("reps", "kg", "s"). Shown on the chart and
  // the comparison so the reader is never left guessing what the number means.
  unit: string;
  // THE statement. One sentence, present tense, tied to this exercise + range. `null`
  // when no comparable single-axis pair exists in range (see `incomparable`).
  headline: string | null;
  // The signed change along the moved axis, pre-formatted with unit ("+2 reps",
  // "+10 kg", "−12 kg", "+35 s").
  delta: string;
  earlier: StoryPerformance;
  later: StoryPerformance;
  series: StoryPoint[];
  incomparable?: IncomparableNote;
}

// Stub stories, one per load dimension plus one honest incomparable case. Each proves
// the invariant: the numbers and the chart in a story never leave that story's single
// dimension and unit.
export const PROGRESS_STORIES: readonly ProgressStory[] = [
  {
    key: "pull-ups",
    exercise: "Weighted Pull-ups",
    rangeLabel: "Last 90 days",
    dimension: "added-weight",
    dimensionLabel: "added weight",
    axis: "reps",
    unit: "reps",
    headline: "2 more reps at the same added weight.",
    delta: "+2 reps",
    earlier: {
      sessionId: "s-0412",
      dateLabel: "Jun 14",
      anchorLabel: "+10 kg added",
      movedLabel: "6 reps",
      chartValue: 6,
    },
    later: {
      sessionId: "s-0731",
      dateLabel: "Sep 2",
      anchorLabel: "+10 kg added",
      movedLabel: "8 reps",
      chartValue: 8,
    },
    series: [
      { dateLabel: "Jun 14", value: 6, kind: "earlier" },
      { dateLabel: "Jul 9", value: 6, kind: "context" },
      { dateLabel: "Aug 5", value: 7, kind: "context" },
      { dateLabel: "Sep 2", value: 8, kind: "later" },
    ],
  },
  {
    key: "back-squat",
    exercise: "Back Squat",
    rangeLabel: "Last 90 days",
    dimension: "absolute-weight",
    dimensionLabel: "barbell weight",
    axis: "load",
    unit: "kg",
    headline: "10 kg heavier for the same 5 reps.",
    delta: "+10 kg",
    earlier: {
      sessionId: "s-0377",
      dateLabel: "Jun 21",
      anchorLabel: "5 reps",
      movedLabel: "100 kg",
      chartValue: 100,
    },
    later: {
      sessionId: "s-0755",
      dateLabel: "Sep 6",
      anchorLabel: "5 reps",
      movedLabel: "110 kg",
      chartValue: 110,
    },
    series: [
      { dateLabel: "Jun 21", value: 100, kind: "earlier" },
      { dateLabel: "Jul 19", value: 102.5, kind: "context" },
      { dateLabel: "Aug 16", value: 105, kind: "context" },
      { dateLabel: "Sep 6", value: 110, kind: "later" },
    ],
  },
  {
    key: "assisted-dip",
    exercise: "Assisted Dip",
    rangeLabel: "Last 90 days",
    dimension: "assisted-load",
    dimensionLabel: "machine assistance",
    axis: "assistance",
    unit: "kg",
    headline: "12 kg less assistance for the same 8 reps.",
    delta: "−12 kg assistance",
    earlier: {
      sessionId: "s-0401",
      dateLabel: "Jun 18",
      anchorLabel: "8 reps",
      movedLabel: "−20 kg assist",
      chartValue: 20,
    },
    later: {
      sessionId: "s-0769",
      dateLabel: "Sep 8",
      anchorLabel: "8 reps",
      movedLabel: "−8 kg assist",
      chartValue: 8,
    },
    series: [
      { dateLabel: "Jun 18", value: 20, kind: "earlier" },
      { dateLabel: "Jul 16", value: 16, kind: "context" },
      { dateLabel: "Aug 13", value: 12, kind: "context" },
      { dateLabel: "Sep 8", value: 8, kind: "later" },
    ],
  },
  {
    key: "push-ups",
    exercise: "Push-ups",
    rangeLabel: "Last 90 days",
    dimension: "bodyweight-reps",
    dimensionLabel: "bodyweight",
    axis: "reps",
    unit: "reps",
    headline: "8 more reps at bodyweight.",
    delta: "+8 reps",
    earlier: {
      sessionId: "s-0360",
      dateLabel: "Jun 11",
      anchorLabel: "bodyweight",
      movedLabel: "22 reps",
      chartValue: 22,
    },
    later: {
      sessionId: "s-0748",
      dateLabel: "Sep 4",
      anchorLabel: "bodyweight",
      movedLabel: "30 reps",
      chartValue: 30,
    },
    series: [
      { dateLabel: "Jun 11", value: 22, kind: "earlier" },
      { dateLabel: "Jul 14", value: 25, kind: "context" },
      { dateLabel: "Aug 10", value: 27, kind: "context" },
      { dateLabel: "Sep 4", value: 30, kind: "later" },
    ],
  },
  {
    key: "plank",
    exercise: "Plank",
    rangeLabel: "Last 90 days",
    dimension: "timed-hold",
    dimensionLabel: "bodyweight hold",
    axis: "hold-seconds",
    unit: "s",
    headline: "35 s longer hold at bodyweight.",
    delta: "+35 s",
    earlier: {
      sessionId: "s-0388",
      dateLabel: "Jun 16",
      anchorLabel: "bodyweight",
      movedLabel: "60 s",
      chartValue: 60,
    },
    later: {
      sessionId: "s-0760",
      dateLabel: "Sep 7",
      anchorLabel: "bodyweight",
      movedLabel: "95 s",
      chartValue: 95,
    },
    series: [
      { dateLabel: "Jun 16", value: 60, kind: "earlier" },
      { dateLabel: "Jul 12", value: 72, kind: "context" },
      { dateLabel: "Aug 9", value: 85, kind: "context" },
      { dateLabel: "Sep 7", value: 95, kind: "later" },
    ],
  },
  {
    // The honest degrade: the two most recent comparable sessions moved BOTH weight and
    // reps, so there is no "same X, better Y" to state. We refuse to manufacture one.
    key: "bench-press",
    exercise: "Bench Press",
    rangeLabel: "Last 90 days",
    dimension: "absolute-weight",
    dimensionLabel: "barbell weight",
    axis: "load",
    unit: "kg",
    headline: null,
    delta: "",
    earlier: {
      sessionId: "s-0415",
      dateLabel: "Aug 20",
      anchorLabel: "5 reps",
      movedLabel: "80 kg",
      chartValue: 80,
    },
    later: {
      sessionId: "s-0772",
      dateLabel: "Sep 9",
      anchorLabel: "3 reps",
      movedLabel: "85 kg",
      chartValue: 85,
    },
    series: [
      { dateLabel: "Aug 20", value: 80, kind: "earlier" },
      { dateLabel: "Sep 9", value: 85, kind: "later" },
    ],
    incomparable: {
      reason:
        "Weight and reps both moved between your last two sessions (80 kg × 5 → 85 kg × 3), so there's no same-effort comparison to make yet. Match the reps or the weight once more and a clean story appears.",
    },
  },
] as const;

// Resolve a `?story=` key to a story, defaulting to the first (Pull-ups) so a
// hand-edited or missing param can never break the screen.
export function resolveStory(key: string | undefined): ProgressStory {
  return (
    PROGRESS_STORIES.find((story) => story.key === key) ?? PROGRESS_STORIES[0]
  );
}
