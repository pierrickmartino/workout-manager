// View-model for previewing a Curated Protocol before adopting it (issue #685, ADR-0130).
//
// The adopt form shows the fully enumerated plan the server would write for the user's length
// and starting weights. This module maps `POST /api/curated-protocols/{identifier}/preview`
// for display, and decides whether the shown preview still matches the form. Adopt is offered
// only while it does: once an input changes, the user previews again before committing. It is
// server-free so the server action and the client form can both import it. The preview is
// computed by the same server code adopt runs, so the Loads shown are the Loads adopted.

import type {
  AdoptCuratedProtocolRequest,
  AdoptFormDefaults,
} from "./curated-protocol-view.ts";
import { formatLoad, type Load } from "./load.ts";
import type { Quantity } from "./quantity.ts";
import { schemeLabel } from "./scheme-view.ts";

export interface CuratedPlanPrescription {
  exercise_name: string;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  recommended_load: Load | null;
  prescribed_quantity: Quantity;
  // Every Curated Prescription names its scheme explicitly (ADR-0130).
  scheme: string;
}

export interface CuratedPlanSession {
  week: number;
  day: number;
  title: string;
  prescriptions: CuratedPlanPrescription[];
}

// The body of a successful preview.
export interface CuratedPreviewResponse {
  identifier: string;
  version: number;
  weeks: number;
  sessions_per_week: number;
  sessions: CuratedPlanSession[];
}

export interface CuratedPlanLine {
  key: string;
  exercise: string;
  dose: string;
  load: string;
  scheme: string;
}

export interface CuratedPlanSessionView {
  key: string;
  heading: string;
  lines: CuratedPlanLine[];
}

export interface CuratedPlanWeek {
  week: number;
  heading: string;
  sessions: CuratedPlanSessionView[];
}

export interface CuratedPlanView {
  summary: string;
  weeks: CuratedPlanWeek[];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function sessionView(session: CuratedPlanSession): CuratedPlanSessionView {
  const key = `${session.week}-${session.day}`;
  return {
    key,
    heading: `Day ${session.day} · ${session.title}`,
    lines: session.prescriptions.map((prescription, index) => ({
      key: `${key}-${index}`,
      exercise: prescription.exercise_name,
      dose: `${prescription.sets} × ${prescription.reps}`,
      // The starting weights are entered in kilograms, so the plan reads back in them.
      load: formatLoad(prescription.recommended_load, "kg"),
      scheme: schemeLabel(prescription.scheme),
    })),
  };
}

// The preview grouped by week, in Week/Day order, as the adopt form shows it.
export function curatedPlanView(preview: CuratedPreviewResponse): CuratedPlanView {
  const weeks = Array.from({ length: preview.weeks }, (_, index) => index + 1).map((week) => ({
    week,
    heading: `Week ${week}`,
    sessions: preview.sessions.filter((session) => session.week === week).map(sessionView),
  }));
  return {
    summary: `${plural(preview.sessions.length, "session")} over ${plural(preview.weeks, "week")}`,
    weeks,
  };
}

// The adopt form's inputs as numbers, keyed by field name: what a preview was made from and
// what the form holds now. A blank or unreadable input is `NaN`, which equals nothing, so it
// never matches a preview.
export type AdoptFormSnapshot = Readonly<Record<string, number>>;

function inputNumber(raw: FormDataEntryValue | null): number {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text === "" ? Number.NaN : Number(text);
}

function snapshotFields(defaults: AdoptFormDefaults): string[] {
  return ["weeks", ...defaults.lifts.map((lift) => lift.name)];
}

export function adoptFormSnapshot(
  defaults: AdoptFormDefaults,
  form: FormData,
): AdoptFormSnapshot {
  return Object.fromEntries(
    snapshotFields(defaults).map((field) => [field, inputNumber(form.get(field))]),
  );
}

// The snapshot of the untouched form, which the page previews before the user edits anything.
export function defaultFormSnapshot(defaults: AdoptFormDefaults): AdoptFormSnapshot {
  return {
    weeks: defaults.weeks,
    ...Object.fromEntries(defaults.lifts.map((lift) => [lift.name, lift.initialKg])),
  };
}

// The preview request for the untouched form: the shortest length and the prefilled weights.
export function defaultPreviewRequest(defaults: AdoptFormDefaults): AdoptCuratedProtocolRequest {
  return {
    weeks: defaults.weeks,
    starting_weights_kg: Object.fromEntries(
      defaults.lifts.map((lift) => [lift.key, lift.initialKg]),
    ),
  };
}

function sameSnapshot(a: AdoptFormSnapshot, b: AdoptFormSnapshot): boolean {
  const fields = Object.keys(a);
  return (
    fields.length === Object.keys(b).length && fields.every((field) => a[field] === b[field])
  );
}

// A shown preview and the inputs it was made from.
export interface CuratedPreview {
  snapshot: AdoptFormSnapshot;
  plan: CuratedPlanView;
}

export type PreviewStatus = "none" | "current" | "stale";

export interface PreviewControls {
  status: PreviewStatus;
  canAdopt: boolean;
  previewLabel: string;
  notice: string | null;
}

const PREVIEW_NOTICES: Record<PreviewStatus, string | null> = {
  none: "Preview the plan before adopting.",
  current: null,
  stale: "You changed the inputs. Preview again before adopting.",
};

// What the adopt form offers given the shown preview and the inputs it holds now. Adopt is
// offered only while the preview matches them, so what the user adopts is what they saw.
export function previewControls(
  preview: CuratedPreview | null,
  current: AdoptFormSnapshot,
): PreviewControls {
  const status: PreviewStatus =
    preview === null ? "none" : sameSnapshot(preview.snapshot, current) ? "current" : "stale";
  return {
    status,
    canAdopt: status === "current",
    previewLabel: preview === null ? "Preview plan" : "Preview again",
    notice: PREVIEW_NOTICES[status],
  };
}
