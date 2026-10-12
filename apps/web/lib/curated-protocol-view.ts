// View-model for choosing and adopting a Curated Protocol (issue #684, ADR-0130).
//
// A Curated Protocol is a human-written, coach-reviewed plan the user Adopts beside "Generate
// for me". This module is server-free so both the server pages and the client adopt form can
// import it: the wire types, the peer choice at the new-Protocol entry point, the picker rows,
// and the adopt form's defaults and parsing. The form check is a convenience; the server
// re-validates everything and recomputes the plan itself.
//
// The surface is never labelled "Library", which already names the Catalog pick widget.

export interface CuratedMainLift {
  key: string;
  exercise_name: string;
  default_starting_weight_kg: number;
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

export function curatedProtocolRow(program: CuratedProtocolSummary): CuratedProtocolRow {
  const sessions = `${program.sessions_per_week} session${program.sessions_per_week === 1 ? "" : "s"} a week`;
  return {
    identifier: program.identifier,
    name: program.name,
    description: program.description,
    schedule: `${sessions} · ${weeksText(program.min_weeks, program.max_weeks)}`,
    mainLifts: program.main_lifts.map((lift) => lift.exercise_name).join(", "),
    equipment: program.required_equipment.join(", "),
    href: curatedProtocolHref(program.identifier),
  };
}

export interface AdoptLiftField {
  key: string;
  // The form field name the weight posts under.
  name: string;
  label: string;
  defaultKg: number;
}

export interface AdoptFormDefaults {
  weeks: number;
  weekOptions: number[];
  lifts: AdoptLiftField[];
}

function liftFieldName(key: string): string {
  return `weight_${key}`;
}

export function adoptFormDefaults(program: CuratedProtocolSummary): AdoptFormDefaults {
  const weekOptions = Array.from(
    { length: program.max_weeks - program.min_weeks + 1 },
    (_, index) => program.min_weeks + index,
  );
  return {
    weeks: program.min_weeks,
    weekOptions,
    lifts: program.main_lifts.map((lift) => ({
      key: lift.key,
      name: liftFieldName(lift.key),
      label: lift.exercise_name,
      defaultKg: lift.default_starting_weight_kg,
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
  program: CuratedProtocolSummary,
  form: FormData,
): AdoptFormResult {
  const weeks = Number(form.get("weeks"));
  if (!Number.isInteger(weeks) || weeks < program.min_weeks || weeks > program.max_weeks) {
    return {
      ok: false,
      error: `Choose a length between ${program.min_weeks} and ${program.max_weeks} weeks.`,
    };
  }

  const startingWeights: Record<string, number> = {};
  for (const lift of program.main_lifts) {
    const kg = positiveNumber(form.get(liftFieldName(lift.key)));
    if (kg === null) {
      return {
        ok: false,
        error: `Enter a starting weight above 0 kg for ${lift.exercise_name}.`,
      };
    }
    startingWeights[lift.key] = kg;
  }
  return { ok: true, request: { weeks, starting_weights_kg: startingWeights } };
}
