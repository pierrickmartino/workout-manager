// View-model for choosing and adopting a Curated Protocol (issue #684, ADR-0130).
//
// A Curated Protocol is a human-written, coach-reviewed plan the user Adopts beside "Generate
// for me". This module is server-free so both the server pages and the client adopt form can
// import it: the wire types, the peer choice at the new-Protocol entry point, the picker rows,
// and the adopt form's defaults and parsing. The form check is a convenience; the server
// re-validates everything and recomputes the plan itself.
//
// The surface is never labelled "Library", which already names the Catalog pick widget.
//
// A Curated Protocol is shared content tailored to no one, so a user with a Sensitive
// Constraint adopts it under the Redeem posture (issue #687, ADR-0130, ADR-0058): they see a
// caveat first, and the copy arrives set aside, offering Switch, rather than Current.

import { adoptedProtocolHref } from "./protocol-supersede.ts";
import type { ProtocolIndexEntry } from "./protocols-index.ts";

// Where a main lift's prefilled starting weight came from (issue #686): a working-weight share
// of the user's Estimated 1RM ("records"), or the Curated Protocol's conservative default.
export type PrefillSource = "records" | "default";

export interface StartingWeightPrefill {
  kg: number;
  source: PrefillSource;
}

export interface CuratedMainLift {
  key: string;
  exercise_name: string;
  default_starting_weight_kg: number;
  // The starting weight offered to this user, computed at read time from their records.
  starting_weight_prefill: StartingWeightPrefill;
}

// What the adopt form asks for per main lift: a starting weight, or for a wave Curated Protocol a
// recent working set (weight × reps) its weeks are computed from (issue #693).
export type MainLiftInput = "starting_weight" | "working_set";

// One row of `GET /api/curated-protocols`.
export interface CuratedProtocolSummary {
  identifier: string;
  version: number;
  name: string;
  description: string;
  training_type: string;
  sessions_per_week: number;
  min_weeks: number;
  max_weeks: number;
  required_equipment: string[];
  main_lift_input: MainLiftInput;
  main_lifts: CuratedMainLift[];
  // Whether this user holds a Sensitive Constraint, so the caveat applies and adopting sets the
  // copy aside (issue #687). Decided by the server, which owns the profile.
  sensitive_constraint_caveat: boolean;
  // The required equipment this user lacks, read from their Default Equipment as generation
  // reads it (issue #689, ADR-0038). Empty when they have it all.
  missing_equipment: string[];
}

// The data of a successful `POST /api/curated-protocols/{identifier}/adopt`.
export interface AdoptCuratedProtocolResponse {
  protocol_id: number;
  // True when the copy was persisted set aside, never Current (a Sensitive Constraint).
  set_aside: boolean;
}

export interface WorkingSet {
  kg: number;
  reps: number;
}

// The body of `POST /api/curated-protocols/{identifier}/adopt` (and preview): one input per main
// lift, of the kind the Curated Protocol's `main_lift_input` names.
export type AdoptCuratedProtocolRequest =
  | { weeks: number; starting_weights_kg: Record<string, number> }
  | { weeks: number; working_sets: Record<string, WorkingSet> };

export type NewProtocolSurface = "generate" | "curated";

// One way to get a new Protocol, as a launch link: which surface it opens, its label and route.
export interface ProtocolChoice {
  surface: NewProtocolSurface;
  label: string;
  href: string;
}

// A choice at the new-Protocol entry point, which also marks the surface the user is on.
export interface NewProtocolChoice extends ProtocolChoice {
  current: boolean;
}

export const CURATED_PICKER_HREF = "/protocols/new/curated";

// Generation alone, wherever it is the only way offered: the TRAIN launchpad, and Home's empty
// state until a Curated Protocol is released. "Generate for me" is the wording beside a peer.
export const GENERATE_PROTOCOL_CHOICE: ProtocolChoice = {
  surface: "generate",
  label: "Generate a protocol",
  href: "/protocols/new",
};

// The two peer ways to get a new Protocol. Curated Protocols are offered only once at least
// one is released, so the entry point never leads to an empty picker.
export function newProtocolChoices(
  surface: NewProtocolSurface,
  { hasCuratedProtocols }: { hasCuratedProtocols: boolean },
): NewProtocolChoice[] {
  const generate: NewProtocolChoice = {
    surface: "generate",
    label: "Generate for me",
    href: GENERATE_PROTOCOL_CHOICE.href,
    current: surface === "generate",
  };
  if (!hasCuratedProtocols) return [generate];
  return [
    generate,
    {
      surface: "curated",
      label: "Choose a Curated Protocol",
      href: CURATED_PICKER_HREF,
      current: surface === "curated",
    },
  ];
}

export interface LaunchpadHeading {
  title: string;
  overline: string;
}

// The launchpad's heading names what its protocol choices are. A Curated Protocol is written by a
// person, not generated, so once one is offered the heading stops calling the card AI-only — an
// equal choice is not filed under generation (issue #690, ADR-0130).
export function launchpadHeading(choices: readonly ProtocolChoice[]): LaunchpadHeading {
  return choices.some((choice) => choice.surface === "curated")
    ? { title: "Start training", overline: "AI OR CURATED PROTOCOLS · STANDALONE SESSIONS" }
    : { title: "Generate training", overline: "AI PROTOCOLS · STANDALONE SESSIONS" };
}

export interface CuratedProtocolRow {
  identifier: string;
  name: string;
  description: string;
  schedule: string;
  mainLifts: string;
  equipment: string;
  // "Needs: …" when the user lacks required equipment, else `null`. Only a flag: the row is
  // never hidden and stays adoptable; nothing is auto-substituted (ADR-0130, ADR-0064).
  equipmentFlag: string | null;
  href: string;
}

function weeksText(min: number, max: number): string {
  return min === max ? `${min} weeks` : `${min}–${max} weeks`;
}

export function curatedProtocolHref(identifier: string): string {
  return `${CURATED_PICKER_HREF}/${encodeURIComponent(identifier)}`;
}

function equipmentFlag(missing: readonly string[]): string | null {
  return missing.length === 0 ? null : `Needs: ${missing.join(", ")}`;
}

export function curatedProtocolRow(curated: CuratedProtocolSummary): CuratedProtocolRow {
  const sessions = `${curated.sessions_per_week} session${curated.sessions_per_week === 1 ? "" : "s"} a week`;
  return {
    identifier: curated.identifier,
    name: curated.name,
    description: curated.description,
    schedule: `${sessions} · ${weeksText(curated.min_weeks, curated.max_weeks)}`,
    mainLifts: curated.main_lifts.map((lift) => lift.exercise_name).join(", "),
    equipment: curated.required_equipment.join(", "),
    equipmentFlag: equipmentFlag(curated.missing_equipment),
    href: curatedProtocolHref(curated.identifier),
  };
}

// The reps half of a working-set input (issue #693).
export interface AdoptRepsField {
  // The form field name the reps post under.
  name: string;
  label: string;
  initial: number;
  hint: string;
}

export interface AdoptLiftField {
  key: string;
  // The form field name the weight posts under.
  name: string;
  label: string;
  // The value the field starts at: the user's prefill, editable like any typed weight.
  initialKg: number;
  source: PrefillSource;
  hint: string;
  // The reps of the working set, for a wave Curated Protocol; `null` when the lift takes a
  // starting weight.
  reps: AdoptRepsField | null;
}

export interface AdoptFormDefaults {
  weeks: number;
  weekOptions: number[];
  lifts: AdoptLiftField[];
}

function liftFieldName(key: string): string {
  return `weight_${key}`;
}

function repsFieldName(key: string): string {
  return `reps_${key}`;
}

// The rep window the server derives a wave from (the Estimated 1RM's trustworthy range).
export const MIN_WORKING_SET_REPS = 1;
export const MAX_WORKING_SET_REPS = 12;
// A working set's reps start here: with the prefilled weight, a conservative first guess.
const DEFAULT_WORKING_SET_REPS = 5;

const WEIGHT_HINTS: Record<MainLiftInput, string> = {
  starting_weight: "Starting weight in kg",
  working_set: "Recent working set: weight in kg",
};

function weightHint(input: MainLiftInput, source: PrefillSource): string {
  return source === "records"
    ? `${WEIGHT_HINTS[input]} · prefilled from your records, edit it freely`
    : WEIGHT_HINTS[input];
}

function repsField(input: MainLiftInput, key: string): AdoptRepsField | null {
  if (input !== "working_set") return null;
  return {
    name: repsFieldName(key),
    label: "Reps",
    initial: DEFAULT_WORKING_SET_REPS,
    hint: `Reps done at that weight, ${MIN_WORKING_SET_REPS} to ${MAX_WORKING_SET_REPS}`,
  };
}

export function adoptFormDefaults(curated: CuratedProtocolSummary): AdoptFormDefaults {
  const weekOptions = Array.from(
    { length: curated.max_weeks - curated.min_weeks + 1 },
    (_, index) => curated.min_weeks + index,
  );
  return {
    weeks: curated.min_weeks,
    weekOptions,
    lifts: curated.main_lifts.map((lift) => ({
      key: lift.key,
      name: liftFieldName(lift.key),
      label: lift.exercise_name,
      initialKg: lift.starting_weight_prefill.kg,
      source: lift.starting_weight_prefill.source,
      hint: weightHint(curated.main_lift_input, lift.starting_weight_prefill.source),
      reps: repsField(curated.main_lift_input, lift.key),
    })),
  };
}

export type AdoptFormResult =
  | { ok: true; request: AdoptCuratedProtocolRequest }
  | { ok: false; error: string };

function positiveNumber(raw: FormDataEntryValue | null): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Read the posted adopt form into the request body, or the first reason it can't be sent.
export function readAdoptForm(
  curated: CuratedProtocolSummary,
  form: FormData,
): AdoptFormResult {
  const weeks = Number(form.get("weeks"));
  if (!Number.isInteger(weeks) || weeks < curated.min_weeks || weeks > curated.max_weeks) {
    return {
      ok: false,
      error: `Choose a length between ${curated.min_weeks} and ${curated.max_weeks} weeks.`,
    };
  }

  return curated.main_lift_input === "working_set"
    ? readWorkingSets(curated, weeks, form)
    : readStartingWeights(curated, weeks, form);
}

function readStartingWeights(
  curated: CuratedProtocolSummary,
  weeks: number,
  form: FormData,
): AdoptFormResult {
  const weights = curated.main_lifts.map(
    (lift) => [lift, positiveNumber(form.get(liftFieldName(lift.key)))] as const,
  );
  const missing = weights.find(([, kg]) => kg === null);
  if (missing) {
    return {
      ok: false,
      error: `Enter a starting weight above 0 kg for ${missing[0].exercise_name}.`,
    };
  }
  return {
    ok: true,
    request: {
      weeks,
      starting_weights_kg: Object.fromEntries(weights.map(([lift, kg]) => [lift.key, kg as number])),
    },
  };
}

function workingSetReps(raw: FormDataEntryValue | null): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  const value = text === "" ? Number.NaN : Number(text);
  return Number.isInteger(value) && value >= MIN_WORKING_SET_REPS && value <= MAX_WORKING_SET_REPS
    ? value
    : null;
}

function readWorkingSets(
  curated: CuratedProtocolSummary,
  weeks: number,
  form: FormData,
): AdoptFormResult {
  const workingSets: Record<string, WorkingSet> = {};
  for (const lift of curated.main_lifts) {
    const kg = positiveNumber(form.get(liftFieldName(lift.key)));
    if (kg === null) {
      return {
        ok: false,
        error: `Enter a working set weight above 0 kg for ${lift.exercise_name}.`,
      };
    }
    const reps = workingSetReps(form.get(repsFieldName(lift.key)));
    if (reps === null) {
      return {
        ok: false,
        error:
          `Enter the reps of your working set for ${lift.exercise_name}, ` +
          `from ${MIN_WORKING_SET_REPS} to ${MAX_WORKING_SET_REPS}.`,
      };
    }
    workingSets[lift.key] = { kg, reps };
  }
  return { ok: true, request: { weeks, working_sets: workingSets } };
}

// The released Curated Protocol named by `identifier` in a list read, or `undefined` when the
// read failed or names none (an unreleased one is indistinguishable from an unknown one).
export function findCuratedProtocol(
  list: { success: boolean; data: CuratedProtocolSummary[] | null },
  identifier: string,
): CuratedProtocolSummary | undefined {
  return list.success
    ? list.data?.find((candidate) => candidate.identifier === identifier)
    : undefined;
}

export interface CuratedCaveat {
  title: string;
  body: string;
}

// The caveat shown before adopting, or `null` when it doesn't apply to this user (ADR-0058). It
// never claims the plan was checked against their constraint: it says the opposite, and what
// adopting will do.
export function curatedCaveat(curated: CuratedProtocolSummary): CuratedCaveat | null {
  if (!curated.sensitive_constraint_caveat) return null;
  return {
    title: "Not tailored to your constraints",
    body:
      "This plan was written for a general audience, not around your injury, rehabilitation, " +
      "postpartum or medical constraint. Adopting it sets it aside rather than making it your " +
      "Current Protocol; Switch to it when you’re ready to start.",
  };
}

// The search parameter naming the Curated Protocol a Sensitive-Constraint user just adopted set
// aside, on the Protocols index where its Switch lives.
export const ADOPTED_PARAM = "adopted";

const PROTOCOLS_INDEX_HREF = "/protocols";

// Where an adopt lands. A set-aside copy goes to the Protocols index, which offers its Switch
// (and blocks it during a Live Session); a Current one goes to the Protocol itself, carrying the
// Protocol it superseded for the set-aside note (ADR-0125).
export function curatedAdoptedHref(
  adopted: AdoptCuratedProtocolResponse,
  supersededId: number | null,
): string {
  if (adopted.set_aside) {
    return `${PROTOCOLS_INDEX_HREF}?${ADOPTED_PARAM}=${adopted.protocol_id}`;
  }
  return adoptedProtocolHref(adopted.protocol_id, supersededId);
}

// The Protocols index note for a set-aside adopt, or `null` when there is nothing true to say:
// no or a malformed id, a Protocol the index doesn't hold, or one no longer set aside (the user
// has Switched to it since, or finished it).
export function curatedSetAsideNotice(
  raw: string | readonly string[] | undefined,
  entries: readonly ProtocolIndexEntry[],
): string | null {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined || entry.status !== "set_aside") return null;
  return `“${entry.label}” is set aside — Switch to start it.`;
}
