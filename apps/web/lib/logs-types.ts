// Shared session-logging types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/logs.ts`.

import type { Effort, EffortScale } from "./effort";
import type { Load, LoadKind } from "./load";
import type { Quantity, QuantityKind } from "./quantity";

// The Completion Outcome (ADR-0013) a client declares on a Logged Session:
// Completed when every prescribed set was attempted, Incomplete when any was left
// un-attempted. Only a Completed log advances the Protocol to its Next Session.
export type CompletionOutcome = "completed" | "incomplete";

// One actual set the user performed within a Logged Session — the real amount
// (a typed Quantity, ADR-0032), load, and perceived difficulty, joined to the catalog
// Exercise performed.
export interface LoggedSet {
  position: number;
  quantity: Quantity | null;
  load: Load | null;
  perceived_difficulty: number | null;
  // The typed Effort (ADR-0066) the user logged, in either scale (RPE or RIR), or null/absent
  // when none was recorded — the set then falls back to `perceived_difficulty` read as RPE. The
  // display projects RPE⇄RIR at read time (`lib/effort.ts`), the effort counterpart of the
  // kg/lb Weight-Unit projection.
  effort?: Effort | null;
  exercise_id: number;
  exercise_name: string;
  // The Performed Body Weight (ADR-0026) — the performer's mass snapshotted onto the set,
  // or null when none was on file at log time (never guessed). Fixes a bodyweight set's
  // strength estimate to what actually happened; surfaced on the record detail.
  body_weight_kg: number | null;
  // The Set Type (ADR-0065) tagging what this performed set was (warm-up / working /
  // drop / failure / AMRAP), or null/absent for "unset" — which resolves to working and
  // renders as no badge (`set-type-view`). Descriptive only; it feeds no analytics yet.
  set_type?: string | null;
  // The Set Note (ADR-0065, #451): the record-side remark on this performed set ("felt easy",
  // "left knee twinge"), or null/absent for "no note" — which the note view-model (`note-view`)
  // renders as nothing. Stored HTML-escaped at the write boundary; the view decodes it for
  // display. Editable through Log Correction like any other Logged Set field.
  note?: string | null;
}

// A record of the user performing a Session on a date. One Session can have many
// Logged Sessions; each is a separate performance and never mutates the plan.
export interface LoggedSession {
  id: number;
  clerk_user_id: string;
  // The prescribing Session's id, or null for a plan-less, standalone record (ADR-0031)
  // — the record then reads its own `training_type` rather than a parent Session's.
  session_id: number | null;
  training_type: string;
  performed_on: string;
  // The declared Completion Outcome, or null when the record does not declare one.
  completion_outcome: CompletionOutcome | null;
  // The recorded Session Duration in whole seconds (ADR-0014), or null when the
  // performance was not live-tracked (e.g. logged after the fact through the form).
  duration_seconds: number | null;
  logged_sets: LoggedSet[];
  // Whether this record may be deleted / un-completed without breaking the gap-free
  // performed sequence (ADR-0034), computed server-side by the one contiguity gate. Present
  // only on the History list read (`GET /api/logs`); the single-record and write responses
  // omit them (they host no correction control). The History screen disables the control
  // when a flag is `false`, so the server's `409` is never a surprise (user story 27).
  deletable?: boolean;
  uncompletable?: boolean;
}

// A set the user submits to record. The amount is captured as a typed Quantity
// (ADR-0032): `quantity_kind` is the picked kind (the log form sends `repetitions`)
// and `quantity_value` its value field. The load is captured the same way — the picked
// `load_kind` plus its `load_value`. Each picked kind is authoritative, so the backend
// types the set from it at the write boundary, never re-guessing the raw value.
export interface LogSetInput {
  exercise_id: number;
  quantity_kind: QuantityKind;
  quantity_value: string | null;
  // A `distance` Quantity's display unit (km or miles) and optional companion time.
  // Both are absent for the repetitions kind the log form has always sent; the backend
  // canonicalises distance to metres and derives pace from the time (ADR-0032).
  quantity_unit?: string;
  quantity_duration?: string | null;
  load_kind: LoadKind;
  load_value: string | null;
  perceived_difficulty: number | null;
  // The logged Effort in either scale (ADR-0066): `effort_scale` is the picked scale and
  // `effort_value` its number. Both omitted means no typed effort (an rpe-only client still
  // sends `perceived_difficulty`); the backend dual-writes the typed value and mirrors an RPE
  // value into `perceived_difficulty`.
  effort_scale?: EffortScale;
  effort_value?: number | null;
  // The Set Note (ADR-0065, #451): an optional record-side remark, or omitted/blank for "no
  // note". The backend length-caps and HTML-escapes it at the write boundary; a blank note
  // stores as unset. Rides the finish, the static log form, the ad-hoc log, and Log Correction.
  note?: string | null;
}

// The request the user submits to record a performance of a Session. The
// `completion_outcome` is the client-declared verdict (ADR-0013): the Live Session
// derives it from whether every set was attempted; the static form defaults to
// `completed`.
export interface LogSessionInput {
  performed_on: string;
  completion_outcome: CompletionOutcome;
  // The recorded Session Duration in whole seconds (ADR-0014). Optional and nullable:
  // the Live Session sends start → last-activity time; the static form omits it.
  duration_seconds?: number | null;
  // The client-minted idempotency key (ADR-0060) that dedupes a retried finish to one
  // Logged Session server-side (issue #410): a retry resends the same key and the write
  // upsert-returns the first record. Optional/nullable — a keyless write still records
  // (the static log form, which has no retry path of its own).
  idempotency_key?: string | null;
  logged_sets: LogSetInput[];
}

// The request the user submits to record a plan-less performance (ADR-0031) — an
// ad-hoc log posted to `/api/logs` with no Session behind it. The `training_type`
// rides on the record (there is no Session to read it from); a Completion Outcome is
// deliberately absent — an ad-hoc record gates no Protocol and declares none.
export interface LogAdhocInput {
  performed_on: string;
  training_type: string;
  logged_sets: LogSetInput[];
}

// The request the user submits to correct a Logged Session's contents after the fact
// (ADR-0034), sent as `PUT /api/logs/{id}`. Full-replace: `logged_sets` carries the
// entire desired set list (at least one). `training_type` rides only on a plan-less
// correction — a plan-backed record keeps the type derived from its Session, so it is
// omitted there. `completion_outcome` corrects a plan-backed record's Completion Outcome
// (ADR-0013); omitted means "leave it unchanged" — the contents-only edit path preserves
// the record's. Body weight is never sent — the Performed Body Weight is carried forward
// from the record on the server, never re-read.
export interface LogCorrectionInput {
  performed_on: string;
  training_type?: string;
  completion_outcome?: CompletionOutcome;
  duration_seconds?: number | null;
  logged_sets: LogSetInput[];
}
