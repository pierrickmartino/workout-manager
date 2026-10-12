// View-model for choosing and adopting a Curated Protocol (issue #684, ADR-0130).
//
// A Curated Protocol is a human-written, coach-reviewed plan the user Adopts beside "Generate
// for me". This module is server-free so both the server pages and the client adopt form can
// import it: the wire types, the peer choice at the new-Protocol entry point, the picker rows,
// and the adopt form's defaults and parsing. The form check is a convenience; the server
// re-validates everything and recomputes the plan itself.
//
// The surface is never labelled "Library", which already names the Catalog pick widget.

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
  main_lifts: CuratedMainLift[];
}

// The body of `POST /api/curated-protocols/{identifier}/adopt`.
export interface AdoptCuratedProtocolRequest {
  weeks: number;
  starting_weights_kg: Record<string, number>;
}

export type NewProtocolSurface = "generate" | "curated";

export interface NewProtocolChoice {
  label: string;
  href: string;
  current: boolean;
}

export const CURATED_PICKER_HREF = "/protocols/new/curated";

// The two peer ways to get a new Protocol. Curated Protocols are offered only once at least
// one is released, so the entry point never leads to an empty picker.
export function newProtocolChoices(
  surface: NewProtocolSurface,
  { hasCuratedProtocols }: { hasCuratedProtocols: boolean },
): NewProtocolChoice[] {
  const generate: NewProtocolChoice = {
    label: "Generate for me",
    href: "/protocols/new",
    current: surface === "generate",
  };
  if (!hasCuratedProtocols) return [generate];
  return [
    generate,
    {
      label: "Choose a Curated Protocol",
      href: CURATED_PICKER_HREF,
      current: surface === "curated",
    },
  ];
}

export interface CuratedProtocolRow {
  identifier: string;
  name: string;
  description: string;
  schedule: string;
  mainLifts: string;
  equipment: string;
  href: string;
}

function weeksText(min: number, max: number): string {
  return min === max ? `${min} weeks` : `${min}–${max} weeks`;
}

export function curatedProtocolHref(identifier: string): string {
  return `${CURATED_PICKER_HREF}/${encodeURIComponent(identifier)}`;
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
    href: curatedProtocolHref(curated.identifier),
  };
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
}

export interface AdoptFormDefaults {
  weeks: number;
  weekOptions: number[];
  lifts: AdoptLiftField[];
}

function liftFieldName(key: string): string {
  return `weight_${key}`;
}

const WEIGHT_HINT = "Starting weight in kg";

function weightHint(source: PrefillSource): string {
  return source === "records"
    ? `${WEIGHT_HINT} · prefilled from your records, edit it freely`
    : WEIGHT_HINT;
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
      hint: weightHint(lift.starting_weight_prefill.source),
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
