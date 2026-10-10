// The Progress Story view-model (ADR-0127): the API's structured comparison of an
// Exercise's latest Logged Session with the one before it, turned into the headline and
// the two compared sessions. The API never sends a sentence — the copy, the Weight Unit
// projection and the links to each Logged Session all live here, so every surface that
// shows a story words it identically. Pure and server-free (no I/O, no server-only
// imports), so it is safe from both Server and Client Components.
//
// No wording judges the change: a decline is stated as plainly as an improvement.

import type { LoadKind } from "./load.ts";
import { formatLongDate } from "./date-format.ts";
import type { WeightUnit } from "./weight-unit";
import { formatWeight } from "./weight-format.ts";

export type ProgressStoryKind = "improved" | "unchanged" | "declined" | "insufficient";

// Which quantity is held equal and which is measured. `reps_at_load` holds the load
// (`held`, in kg) and measures reps.
export type ProgressStoryAxis = "reps_at_load";

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
  const load = formatWeight(held, unit);
  return {
    headline: headline(story.kind, delta, latest.value, load),
    rows: [row("Last time", previous, load), row("Latest", latest, load)],
  };
}

function headline(
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

function row(label: string, side: ProgressStorySide, load: string): ProgressStoryRow {
  return {
    label,
    performance: `${reps(side.value)} at ${load}`,
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
