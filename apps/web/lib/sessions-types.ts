// Shared Session constants and types. This module has NO server-only imports,
// so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/sessions.ts`.

import type { Load } from "./load";
import type { Quantity } from "./quantity";
import type { SuggestedVariation } from "./harder-variation-view";

// Training types a Session can be generated for. Mirrors the Fitness Level
// dimensions used elsewhere in the app.
export const TRAINING_TYPES = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

// One set of an Exercise's previous performance — the reps and load the user did
// last time, surfaced on the live screen as the reference to beat (issue #90).
export interface PreviousSet {
  reps: number;
  load: Load | null;
}

// The prescription of one Exercise within a Session — the sets/reps/etc. the
// user is told to perform, joined to its catalog Exercise definition.
export interface ExercisePrescription {
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  recommended_load: Load | null;
  // The typed Prescribed Quantity (ADR-0050): the plan's "how much" axis — a rep count, a
  // distance, or a duration — mirroring the record side's `LoggedSet.quantity`. The
  // log-session view-model reads its `kind` to render the matching input; `null` on a
  // prescription that carries no typed amount (a pre-backfill/legacy read), where the form
  // falls back to the free-text `reps` as a repetitions hint. Optional here like
  // `previous_performance`: the plain Session read carries it, other read paths need not.
  prescribed_quantity?: Quantity | null;
  // Superset overlay (ADR-0023): the group tag members of one Superset share and the
  // group-owned round-rest. Both null on a flat, solo Prescription. Optional here like
  // `previous_performance` — the Protocol/Builder read always carries them (the server
  // serializes them on every Prescription), while pre-Superset read paths need not.
  superset_group?: string | null;
  round_rest_seconds?: number | null;
  // The Pinned Target (ADR-0053): the user-set rep range committed onto this Prescription's
  // next un-performed occurrence, which suspends automatic read-time Progression for the
  // movement until un-pinned. `null`/absent when unpinned — its presence is the "user-set"
  // marker the plan view reads to surface the pinned range and offer the un-pin control.
  pinned_reps?: string | null;
  exercise_id: number;
  exercise_name: string;
  exercise_description: string | null;
  targeted_muscles: string[];
  required_equipment: string[];
  provenance: string;
  // The Exercise's most recent Logged Sets, aligned to this prescription's sets by
  // ordinal. Present only on the live hydration read (issue #90); omitted on the
  // plain Session read, so it is optional. Empty when the Exercise was never logged.
  previous_performance?: PreviousSet[];
}

export interface WorkoutSession {
  id: number;
  clerk_user_id: string;
  training_type: string;
  duration_minutes: number;
  has_been_regenerated: boolean;
  // Session Provenance (ADR-0040): how the plan came to exist — `ai_generated` or
  // `user_authored`. Gates the AI-only affordances (Generation Feedback, Regeneration)
  // via `aiAffordanceVisibility`. Optional here because the plain Session read always
  // carries it while the live hydration read omits it (mirror of `previous_performance`).
  provenance?: string;
  // Whether this Session belongs to a Protocol (ADR-0043 consequence, Q2). The Session
  // view withholds the Duplicate control on a Protocol member — lifting one workout out of
  // a plan the user is working through has no value there; Duplicate stays on standalone
  // Sessions. Optional because the live hydration read omits it (mirror of `provenance`);
  // the plain Session read always carries it, so the detail page reads it there.
  is_protocol_member?: boolean;
  // The user-given Session Name (issue #394): the raw stored value, `null`/absent when the
  // Session is unnamed (so the rename editor opens empty). The plain Session read carries it;
  // the live hydration read omits it, so it is optional here (mirror of `provenance`).
  name?: string | null;
  // The never-blank display label the server resolves from the shared fallback — the Session
  // Name when set, else `training_type · date`. The `sessionName` view-model reads it as the
  // fallback so an unnamed Session is never rendered blank.
  display_name?: string;
  // Author (CONTEXT: Author, issue #395): who first created this plan, surfaced as "by <name>"
  // on the Session view — a distinct axis from Session Provenance (how it was made). The plain
  // Session read always carries it; the live hydration read omits it, so it is optional here
  // (mirror of `provenance`). The `sessionAuthorView` mapper applies the generic fallback.
  author?: SessionAuthor;
  // Favorite (CONTEXT: Favorite, issue #396): the owner's stored, per-user, per-copy marker,
  // surfaced on the standalone Session read as a toggle. `true`/`false` on a standalone Session;
  // `null` when withheld on a Protocol member (Favorite is standalone-only), and absent on read
  // paths that omit it (live hydration). The `sessionFavoriteView` mapper owns the "show the
  // toggle only when the marker is a boolean" decision so the page stays thin.
  is_favorite?: boolean | null;
  prescriptions: ExercisePrescription[];
}

// A Session's Author (CONTEXT: Author, issue #395): who first created the plan. `display_name` is
// that creator's *raw* Profile name — `null`/absent when they never set one — which the
// `sessionAuthorView` mapper resolves to a never-blank byline (the generic fallback then). The
// underlying Author reference (the creator's user id) stays server-side and off the wire.
export interface SessionAuthor {
  display_name?: string | null;
}

// A Share Link the sharer produces on their standalone Session (ADR-0057, issue #398): the
// unguessable `token` is the whole capability the recipient redeems, `session_id` ties it back
// to the shared Session, and `is_revoked` reflects its live/off state. The client builds the
// shareable URL from the token (`shareLinkView`); the token itself is never a URL.
export interface ShareLink {
  token: string;
  session_id: number;
  is_revoked: boolean;
}

// The recipient's pre-Redeem preview of a Share Link (ADR-0057, issue #398): the linked
// Session's validity plus only its name label, Training Type, and Author credit — nothing else
// (no prescriptions, no owner). `valid` is false for a revoked or unknown link, where the
// descriptive fields are all null. The `sharePreviewView` mapper turns this into the display model.
export interface SharePreview {
  valid: boolean;
  display_name: string | null;
  training_type: string | null;
  author: SessionAuthor;
}

// The harder-Variation offer read for one Prescription (#202): the catalog
// Exercise to advance to at the pure-bodyweight rep ceiling, or `null` when there
// is none on file and the prescription holds. The client feeds `suggested_variation`
// to `toHarderVariationOffer` (lib/harder-variation-view) to build the display model.
export interface HarderVariationResponse {
  suggested_variation: SuggestedVariation | null;
}

// A short reference to a related catalog Exercise (a Variation or Alternative),
// as returned on an Exercise's detail.
export interface RelatedExerciseSummary {
  id: number;
  name: string;
}

// The enriched detail of a single catalog Exercise, plus its typed relationships
// split into Variations (same movement, scaled) and Alternatives (same effect).
export interface ExerciseDetail {
  id: number;
  name: string;
  description: string | null;
  provenance: string;
  // The flat, durable muscle union the analytics roll-up reads (ADR-0011), plus the
  // Primary/Secondary emphasis split layered on top (ADR-0016). The split is empty
  // when the Exercise asserts no primacy; the SPECS map falls back to the union then.
  targeted_muscles: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  required_equipment: string[];
  // Ordered Execution Steps (ADR-0015): one entry per authored step, never a prose
  // blob. Rendered numbered (2+) or as a single un-numbered block.
  instructions: string[];
  difficulty: number | null;
  precautions: string[];
  // An optional curated-source Exercise Image (ADR-0041): a single illustration
  // reference, `null` when the movement carries none. Curator-only and never
  // AI-fabricated; its absence never degrades the Detail page.
  image: string | null;
  // Catalog Completeness (ADR-0041): the read-time Stub | Listable | Enriched tier,
  // a content-presence axis distinct from `provenance` (trust). Shown beside the
  // Provenance marker in the Detail header.
  completeness: string;
  variations: RelatedExerciseSummary[];
  alternatives: RelatedExerciseSummary[];
}

// The request the user submits to generate a standalone Session.
export interface GenerateSessionInput {
  training_type: string;
  duration_minutes: number;
  equipment: string[];
}
