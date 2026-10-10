// The Progress Story view-model (ADR-0127): the API's structured comparison of an
// Exercise's latest Logged Session with the most recent earlier comparable one, turned
// into the headline and the two compared sessions. The API never sends a sentence — the
// copy, the Weight Unit projection and the links to each Logged Session all live here, so
// every surface that shows a story words it identically. Pure and server-free (no I/O, no server-only
// imports), so it is safe from both Server and Client Components.
//
// No wording judges the change: a decline is stated as plainly as an improvement. A
// bodyweight story is worded on its added load ("bodyweight + 10 kg"), never as a bare kg
// total (ADR-0026).

import type { LoadKind } from "./load.ts";
import { formatLongDate } from "./date-format.ts";
import type { WeightUnit } from "./weight-unit";
import { formatWeight, formatWeightNumber } from "./weight-format.ts";

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

// The two compared sets' Performed Body Weights, in kg — sent only for a bodyweight story
// when both were recorded and they differ.
export interface ProgressStoryBodyWeight {
  previous_kg: number;
  latest_kg: number;
}

// The API's structured story. Every field but `kind` is `null` when insufficient. For a
// bodyweight story the load (`held`, or the measured values) is the *added* load.
export interface ProgressStory {
  kind: ProgressStoryKind;
  axis: ProgressStoryAxis | null;
  load_kind: LoadKind | null;
  held: number | null;
  delta: number | null;
  latest: ProgressStorySide | null;
  previous: ProgressStorySide | null;
  body_weight: ProgressStoryBodyWeight | null;
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
  // "Body weight 80 → 78 kg." when the two sides’ Performed Body Weights differ.
  footnote: string | null;
}

export const INSUFFICIENT_HEADLINE =
  "No comparable sessions yet. Repeat a load or a rep count from last time to see what changed.";

export function toProgressStoryView(
  story: ProgressStory,
  unit: WeightUnit,
): ProgressStoryView {
  const { latest, previous, held, delta } = story;
  // Only absolute and bodyweight Loads have a display rule; a story in any other Load kind
  // is not worded rather than shown as a bare kg number.
  const loadKind = story.load_kind;
  if (
    story.kind === "insufficient" ||
    (loadKind !== "absolute" && loadKind !== "bodyweight") ||
    latest === null ||
    previous === null ||
    held === null ||
    delta === null
  ) {
    return { headline: INSUFFICIENT_HEADLINE, rows: [], footnote: null };
  }
  const footnote = bodyWeightFootnote(story.body_weight, unit);
  if (story.axis === "load_at_reps") {
    return {
      headline: loadAtRepsHeadline(story.kind, loadKind, delta, held, latest.value, unit),
      rows: [
        row("Last time", previous, `${reps(held)} at ${loadText(loadKind, previous.value, unit)}`),
        row("Latest", latest, `${reps(held)} at ${loadText(loadKind, latest.value, unit)}`),
      ],
      footnote,
    };
  }
  const load = loadText(loadKind, held, unit);
  return {
    headline: repsAtLoadHeadline(story.kind, delta, latest.value, load),
    rows: [
      row("Last time", previous, `${reps(previous.value)} at ${load}`),
      row("Latest", latest, `${reps(latest.value)} at ${load}`),
    ],
    footnote,
  };
}

// The load as the user prescribed it: a bar weight, or bodyweight plus its added load —
// plain "bodyweight" when nothing was added.
function loadText(kind: "absolute" | "bodyweight", kg: number, unit: WeightUnit): string {
  if (kind === "absolute") return formatWeight(kg, unit);
  return kg === 0 ? "bodyweight" : `bodyweight + ${formatWeight(kg, unit)}`;
}

// "Body weight 80 → 78 kg." — previous to latest, one unit label for the pair.
function bodyWeightFootnote(
  bodyWeight: ProgressStoryBodyWeight | null,
  unit: WeightUnit,
): string | null {
  if (bodyWeight === null) return null;
  const previous = formatWeightNumber(bodyWeight.previous_kg, unit);
  return `Body weight ${previous} → ${formatWeight(bodyWeight.latest_kg, unit)}.`;
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
// typographic minus, stated as plainly as a gain. A bodyweight change is the added load
// ("+2.5 kg added for 5 reps."), so it never reads as a bare kg total.
function loadAtRepsHeadline(
  kind: ProgressStoryKind,
  loadKind: "absolute" | "bodyweight",
  delta: number,
  heldReps: number,
  latestKg: number,
  unit: WeightUnit,
): string {
  // The API never sends this (equal loads are a shared load, so the shared-load rule wins),
  // but a structurally valid story is still worded honestly rather than as "+0 kg".
  if (kind === "unchanged") {
    return `Same as last time: ${reps(heldReps)} at ${loadText(loadKind, latestKg, unit)}.`;
  }
  const sign = kind === "improved" ? "+" : "−";
  const added = loadKind === "bodyweight" ? " added" : "";
  return `${sign}${formatWeight(Math.abs(delta), unit)}${added} for ${reps(heldReps)}.`;
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
