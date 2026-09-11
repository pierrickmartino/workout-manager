"use server";

import { redirect } from "next/navigation";

import { resolveExercise } from "@/lib/exercises";
import { authorPlan, authorSession } from "@/lib/sessions";
import type {
  AuthorPlanInput,
  AuthorSessionInput,
} from "@/lib/hand-authored-session";
import type { PickedExercise } from "@/lib/protocol-builder";

export interface AuthorSessionFormState {
  error: string | null;
}

export interface ResolveExerciseResult {
  exercise: PickedExercise | null;
  error: string | null;
}

// Resolve a typed movement to a catalog Exercise for the build-and-log picker
// (ADR-0033, issue #288). On a catalog miss the search-and-create endpoint mints a
// `user_entered` Exercise; a name that already resolves (curated, AI, or a prior
// user-entered one) comes back untouched by normalized-name dedup — no duplicate. The
// Clerk JWT is attached server-side and never reaches the browser. The resolved id then
// rides into the authored Session exactly like a catalog pick, so the create path still
// receives only real `exercise_id`s. Blank/over-long names are rejected by the endpoint
// contract and surfaced back to the picker.
export async function resolveAuthoredExercise(
  name: string,
): Promise<ResolveExerciseResult> {
  const result = await resolveExercise(name);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error: result.error ?? `Could not add “${name}”.`,
    };
  }
  return {
    exercise: { id: result.data.id, name: result.data.name },
    error: null,
  };
}

// Persist a Hand-Authored Session (ADR-0040): the client has already mapped the
// build-and-log draft into the payload through the pure `buildAuthorSessionRequest`
// view-model, so this action is a thin transport-and-redirect shell. On success the new
// logged session lands in History (like any performance); on failure the boundary's
// message is surfaced back to the form. The payload is the authority — the client-side
// validation is UX, the server re-validates and can still reject.
export async function submitAuthorSession(
  input: AuthorSessionInput,
): Promise<AuthorSessionFormState> {
  const result = await authorSession(input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your workout." };
  }

  redirect("/history");
}

// Capture a plan-less record into a reusable plan (ADR-0044): the client has finalized the
// pre-filled builder into the plan-only payload through `buildAuthorPlanRequest`, so this is
// a thin transport-and-redirect shell. It authors **only** the plan — no second performance
// is logged — and on success lands the user on the new standalone Session to run or tweak.
// On failure the boundary's message is surfaced back to the form.
export async function submitAuthorPlan(
  input: AuthorPlanInput,
): Promise<AuthorSessionFormState> {
  const result = await authorPlan(input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save this as a reusable session." };
  }

  redirect(`/sessions/${result.data.id}`);
}
