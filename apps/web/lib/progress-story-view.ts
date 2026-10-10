// The Progress Story view-model (ADR-0127): the API's structured comparison of an
// Exercise's latest Logged Session with the most recent earlier comparable one, turned
// into the headline and the two compared sessions. The API never sends a sentence — the
// copy, the Weight Unit projection and the links to each Logged Session all live here, so
// every surface that shows a story words it identically. Pure and server-free (no I/O, no server-only
// imports), so it is safe from both Server and Client Components.
//
// No wording judges the change: a decline is stated as plainly as an improvement.

import type { LoadKind } from "./load.ts";
import { formatLongDate } from "./date-format.ts";
import type { WeightUnit } from "./weight-unit";
import { formatWeight } from "./weight-format.ts";

export type ProgressStoryKind = "improved" | "unchanged" | "declined" | "insufficient";

// Which quantity is held equal and which is measured. `reps_at_load` holds the load
// (`held`, in kg) and measures reps; `load_at_reps` holds the rep count (`held`) and
// measures the load, in kg.
export type ProgressStoryAxis = "reps_at_load" | "load_at_reps";

// One compared Logged Session and the value it measured on the story's axis.
export interface ProgressStorySide {
  logged_session_id: number;
  performed_on: string;
  value: number;
}

// The API's structured story. Every field but `kind` is `null` when insufficient.
export interface ProgressStory {
  kind: ProgressStoryKind;
  axis: ProgressStoryAxis | null;
  load_kind: LoadKind | null;
  held: number | null;
  delta: number | null;
  latest: ProgressStorySide | null;
  previous: ProgressStorySide | null;
}

// One compared session, ready to render: what was done, when, and its record's route.
export interface ProgressStoryRow {
  label: string;
  performance: string;
  date: string;
  href: string;
}

export interface ProgressStoryView {
  headline: string;
  // Previous first, then latest — empty when there is nothing comparable.
  rows: ProgressStoryRow[];
}

export const INSUFFICIENT_HEADLINE =
  "No comparable sessions yet. Repeat a load or a rep count from last time to see what changed.";

export function toProgressStoryView(
  story: ProgressStory,
  unit: WeightUnit,
): ProgressStoryView {
  const { latest, previous, held, delta } = story;
  // Only an absolute Load reads as a kilogram figure; a story in any other Load kind is not
  // worded until its own display rule exists, rather than shown as a bare kg number.
  if (
    story.kind === "insufficient" ||
    story.load_kind !== "absolute" ||
    latest === null ||
    previous === null ||
    held === null ||
    delta === null
  ) {
    return { headline: INSUFFICIENT_HEADLINE, rows: [] };
  }
  if (story.axis === "load_at_reps") {
    return {
      headline: loadAtRepsHeadline(story.kind, delta, held, latest.value, unit),
      rows: [
        row("Last time", previous, `${reps(held)} at ${formatWeight(previous.value, unit)}`),
        row("Latest", latest, `${reps(held)} at ${formatWeight(latest.value, unit)}`),
      ],
    };
  }
  const load = formatWeight(held, unit);
  return {
    headline: repsAtLoadHeadline(story.kind, delta, latest.value, load),
    rows: [
      row("Last time", previous, `${reps(previous.value)} at ${load}`),
      row("Latest", latest, `${reps(latest.value)} at ${load}`),
    ],
  };
}

// "2 more reps at 60 kg than last time." — the load is held, the reps measured.
function repsAtLoadHeadline(
  kind: ProgressStoryKind,
  delta: number,
  latestReps: number,
  load: string,
): string {
  if (kind === "unchanged") {
    return `Same as last time: ${reps(latestReps)} at ${load}.`;
  }
  const change = kind === "improved" ? "more" : "fewer";
  const count = Math.abs(delta);
  return `${count} ${change} ${repNoun(count)} at ${load} than last time.`;
}

// "+2.5 kg for 5 reps." — the rep count is held, the load measured. A decline takes the
// typographic minus, stated as plainly as a gain.
function loadAtRepsHeadline(
  kind: ProgressStoryKind,
  delta: number,
  heldReps: number,
  latestKg: number,
  unit: WeightUnit,
): string {
  // The API never sends this (equal loads are a shared load, so the shared-load rule wins),
  // but a structurally valid story is still worded honestly rather than as "+0 kg".
  if (kind === "unchanged") {
    return `Same as last time: ${reps(heldReps)} at ${formatWeight(latestKg, unit)}.`;
  }
  const sign = kind === "improved" ? "+" : "−";
  return `${sign}${formatWeight(Math.abs(delta), unit)} for ${reps(heldReps)}.`;
}

function row(label: string, side: ProgressStorySide, performance: string): ProgressStoryRow {
  return {
    label,
    performance,
    date: formatLongDate(side.performed_on),
    href: `/history/${side.logged_session_id}`,
  };
}

function reps(count: number): string {
  return `${count} ${repNoun(count)}`;
}

function repNoun(count: number): string {
  return count === 1 ? "rep" : "reps";
}
