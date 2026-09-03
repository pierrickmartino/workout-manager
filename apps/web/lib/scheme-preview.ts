// The Scheme Preview projection (CONTEXT: Scheme Preview; ADR-0064/0065, #452) — the web twin
// of the backend `app/domain/scheme_preview.py`. Given a Prescription's chosen Progression
// Scheme together with its current reps and typed Load, it renders one plain-language sentence
// describing what the scheme will do next — the same species as Tempo's phase expansion.
//
// It is a **read-time projection**: it stores nothing and touches no record, it only *describes*
// the stepping rule. Living on the client (like `tempo-view`) lets the sentence update live as
// the scheme select changes, before any server round-trip. The sentence reads **honestly for
// each Load kind**: a weight axis speaks of kilograms, a *pure*-bodyweight movement of reps
// (never "add kg"), and a Load with no clean value to step says so. The strings and the numbers
// mirror the backend exactly, so the description can never drift from the behaviour.
//
// This module has NO server-only imports, so it is safe in both Server and Client Components.

import { isPureBodyweight, type Load, type LoadKind } from "./load.ts";
import type { ProgressionScheme } from "./scheme-view.ts";

// The step constants — mirrors of the backend `progression` module. Kept here (not imported)
// because the client has no access to the Python domain; the backend unit tests and these
// view-model tests together pin the two in lock-step.
const INCREASE_KG = 2.5;
const DECREASE_KG = 5;
const LOW_EFFORT_MAX = 7;
const RESET_PERCENT = 10; // RESET_FRACTION 0.9 → a 10% deload.
const SESSION_COUNT_N = 3;

// Read-time typography, matching the backend: an en dash for a rep range ("8–12"), an em dash
// for the trailing aside.
const EN_DASH = "–";
const EM_DASH = "—";

// Which axis a scheme would move on this Load — the one fact the sentence branches on.
type Axis = "weight" | "reps" | "none";

// A parsed rep target: its floor and ceiling (equal for a single number).
interface RepTarget {
  floor: number;
  ceiling: number;
}

const RANGE_REPS = /^\s*(\d+)\s*-\s*(\d+)\s*$/;
const SINGLE_REPS = /^\s*(\d+)\s*$/;
const AMRAP_FLOOR = /^\s*(\d+)\s*\+\s*$/;

// Parse the prescribed reps into a `(floor, ceiling)` target — a range or a single number.
// Free-text targets like "AMRAP" and AMRAP-with-floor ("5+") return null (see `greyskullFloor`).
function parseRepTarget(reps: string): RepTarget | null {
  const range = RANGE_REPS.exec(reps);
  if (range !== null) {
    return { floor: Number(range[1]), ceiling: Number(range[2]) };
  }
  const single = SINGLE_REPS.exec(reps);
  if (single !== null) {
    const value = Number(single[1]);
    return { floor: value, ceiling: value };
  }
  return null;
}

// The rep floor Greyskull checks: the range/single lower bound, or the number before an AMRAP
// `+` ("5+" → 5). A floorless target (bare "AMRAP") has none.
function greyskullFloor(reps: string): number | null {
  const target = parseRepTarget(reps);
  if (target !== null) return target.floor;
  const amrap = AMRAP_FLOOR.exec(reps);
  return amrap !== null ? Number(amrap[1]) : null;
}

// Classify a typed Load into the axis a scheme would step (ADR-0026), mirroring the engine's own
// branch: an absolute or weighted-bodyweight Load moves kilograms; a pure-bodyweight Load moves
// its rep target; everything else — %1RM, range, qualitative, or absent — has no clean value.
function axisOf(load: Load | null | undefined): Axis {
  if (load == null) return "none";
  if (load.kind === "absolute") return "weight";
  if (load.kind === "bodyweight") return isPureBodyweight(load) ? "reps" : "weight";
  return "none";
}

// Render a kilogram amount without a trailing ".0" (2.5 → "2.5 kg", 5 → "5 kg").
function formatKg(value: number): string {
  return `${value} kg`;
}

function rpePhrase(): string {
  return `RPE ${LOW_EFFORT_MAX} or lower`;
}

// Render a small ordinal (3 → "3rd") for the Session-Count cadence.
function ordinal(n: number): string {
  const suffix =
    n % 100 >= 10 && n % 100 <= 20
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// Render the current rep target for reading — reflecting the movement's own reps. A range renders
// with an en dash ("8-12" → "8–12 reps"); a single number and an AMRAP-with-floor ("5+") render
// as written; a floorless target falls back to its trimmed text rather than a fabricated number.
function repsPhrase(reps: string): string {
  const target = parseRepTarget(reps);
  if (target !== null) {
    return target.floor === target.ceiling
      ? `${target.floor} reps`
      : `${target.floor}${EN_DASH}${target.ceiling} reps`;
  }
  if (AMRAP_FLOOR.test(reps)) {
    return `${greyskullFloor(reps)}+ reps`;
  }
  const stripped = reps.trim();
  return stripped.length > 0 ? stripped : "the authored reps";
}

function doubleSentence(reps: string, axis: Axis): string {
  const phrase = repsPhrase(reps);
  if (axis === "none") {
    return `Double Progression needs a single load value to step, so it holds ${phrase} at this load unchanged.`;
  }
  const target = parseRepTarget(reps);
  if (target === null) {
    return `Double Progression needs a set rep target to step, so it holds ${phrase} unchanged.`;
  }
  const { floor, ceiling } = target;
  if (axis === "weight") {
    return `Aim for ${phrase}; when every set reaches ${ceiling} at ${rpePhrase()}, add ${formatKg(INCREASE_KG)} next time ${EM_DASH} miss the ${floor}-rep floor and it backs off ${formatKg(DECREASE_KG)}.`;
  }
  if (floor < ceiling) {
    return `Aim for ${phrase}; when every set reaches ${ceiling} at ${rpePhrase()}, add a rep to the target next time.`;
  }
  return `Aim for ${phrase}; when every set reaches ${ceiling} at ${rpePhrase()}, you'll be offered a harder variation rather than more reps.`;
}

function greyskullSentence(reps: string, axis: Axis): string {
  if (axis !== "weight") {
    return "Greyskull-style Linear only steps a weighted movement, so it can't adjust this load.";
  }
  const floor = greyskullFloor(reps);
  if (floor === null) {
    return "Greyskull-style Linear needs a rep floor to check, so it holds until the reps name one.";
  }
  return `Do ${repsPhrase(reps)} with an all-out final set; clear the ${floor}-rep floor and add ${formatKg(INCREASE_KG)} next session ${EM_DASH} miss it and the load resets down ${RESET_PERCENT}%.`;
}

function sessionCountSentence(reps: string, axis: Axis): string {
  const ord = ordinal(SESSION_COUNT_N);
  const phrase = repsPhrase(reps);
  if (axis === "none") {
    return `This load has no single value to step, so Session-Count-Based holds ${phrase} at it every session.`;
  }
  if (axis === "weight") {
    return `Keep ${phrase}; every ${ord} time you train this movement it adds ${formatKg(INCREASE_KG)} automatically ${EM_DASH} no rep or effort target gates it, and it never steps down.`;
  }
  return `Every ${ord} time you train this movement it adds a rep to the ${phrase} target automatically ${EM_DASH} no effort target gates it, and it never steps down.`;
}

function staticSentence(reps: string, load: Load | null | undefined): string {
  const phrase = repsPhrase(reps);
  const held = load != null ? `${phrase} and its load` : phrase;
  return `Static holds ${held} exactly as written ${EM_DASH} nothing auto-adjusts; you set the numbers by hand.`;
}

// Render a Progression Scheme's stepping rule as one plain-language sentence (ADR-0064), from the
// same `(scheme, reps, Load)` the read-time overlay resolves. Pure: stores nothing, touches no
// record. The one place the client turns a scheme + reps + Load into its Scheme Preview.
export function schemePreview(
  scheme: ProgressionScheme,
  reps: string,
  load: Load | null | undefined,
): string {
  const axis = axisOf(load);
  switch (scheme) {
    case "double_progression":
      return doubleSentence(reps, axis);
    case "greyskull":
      return greyskullSentence(reps, axis);
    case "session_count":
      return sessionCountSentence(reps, axis);
    case "static":
      return staticSentence(reps, load);
  }
}

// The Scheme Preview for a Load expressed as the Builder's raw kind + value input (#452) — the
// Builder edits Load as an un-typed kind+value pair, not a resolved `Load`. Reconstructs the one
// distinction the axis cares about (a `bodyweight` load is weighted only with a positive added
// value; a blank/zero value is pure bodyweight), exactly as `compatibleSchemesForInput` does, so
// the Builder's preview and its offered schemes agree on what the Load is.
export function schemePreviewForInput(
  scheme: ProgressionScheme,
  reps: string,
  loadKind: LoadKind,
  loadValue: string,
): string {
  const added = Number.parseFloat(loadValue);
  const hasAdded = Number.isFinite(added) && added > 0;
  const load: Load =
    loadKind === "bodyweight"
      ? { kind: "bodyweight", text: loadValue, added_kg: hasAdded ? added : undefined }
      : { kind: loadKind, text: loadValue };
  return schemePreview(scheme, reps, load);
}
