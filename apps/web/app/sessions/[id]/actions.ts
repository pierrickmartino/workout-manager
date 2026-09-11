"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  chooseScheme,
  clearScheme,
  createShareLink,
  duplicateSession,
  favoriteSession,
  insertPrescription,
  removePrescription,
  renameSession,
  revokeShareLink,
  substitutePrescription,
  unfavoriteSession,
} from "@/lib/sessions";
import { requestSessionDelete } from "@/app/sessions/delete-request";
import { toDuplicateResult } from "@/lib/duplicate-session";
import {
  SHARE_FALLBACK_ERROR,
  toShareLinkResult,
  type ShareLinkResult,
} from "@/lib/share-link";
import type { AuthorPrescriptionInput } from "@/lib/hand-authored-session";

export interface SubstituteFormState {
  error: string | null;
}

export interface DuplicateFormState {
  error: string | null;
}

export interface InsertPrescriptionFormState {
  error: string | null;
}

export interface RemovePrescriptionFormState {
  error: string | null;
}

export interface SchemeFormState {
  error: string | null;
}

export interface RenameFormState {
  error: string | null;
}

export interface FavoriteFormState {
  error: string | null;
}

export interface DeleteFormState {
  error: string | null;
}

// Permanently delete the user's own standalone Session from its detail page (Delete, ADR-0063).
// The Session no longer exists on success, so this redirects to My Sessions rather than
// revalidating a page that would now 404. On failure — the Session has logged training (409), is a
// Protocol member (409), or is not the user's (404) — the server's message is returned for the
// control to surface, and nothing is deleted. `redirect` throws to navigate, so it runs after the
// write and outside any try/catch. The parse-guard-call body is shared with the library-row
// action via `requestSessionDelete`; only the on-success step (redirect vs. revalidate) differs.
export async function submitDeleteSession(
  _prevState: DeleteFormState,
  form: FormData,
): Promise<DeleteFormState> {
  const error = await requestSessionDelete(form);
  if (error) {
    return { error };
  }

  redirect("/sessions");
}

// Mark or unmark the user's own standalone Session as a Favorite (CONTEXT: Favorite, issue
// #396). A thin transport-and-revalidate shell: the hidden `favorite` field carries the desired
// next state ("true" to mark, anything else to unmark), so the toggle sends the opposite of the
// current state. On success the Session page is revalidated so the toggle reflects the new marker
// in place; on failure — a non-owned Session (404) or a Protocol member (409, Favorite is
// standalone-only) — the server's message is returned for the control to surface, nothing changed.
export async function submitFavorite(
  _prevState: FavoriteFormState,
  form: FormData,
): Promise<FavoriteFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to favorite." };
  }

  const favorite = form.get("favorite") === "true";
  const result = favorite
    ? await favoriteSession(sessionId)
    : await unfavoriteSession(sessionId);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not update this favorite." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Set, edit, or clear the user-given Session Name on the user's own standalone Session
// (rename, issue #394). A thin transport-and-revalidate shell: an empty/whitespace name is
// sent as `null` to clear it (the read then falls back to the derived label). On success the
// Session page is revalidated so the header reflects the new name in place; on failure — a
// non-owned Session (404) or a Protocol member (409, Session Name is standalone-only) — the
// server's message is returned for the control to surface, and nothing is persisted.
export async function submitRename(
  _prevState: RenameFormState,
  form: FormData,
): Promise<RenameFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to rename." };
  }

  const raw = typeof form.get("name") === "string" ? String(form.get("name")) : "";
  const trimmed = raw.trim();
  const result = await renameSession(sessionId, trimmed === "" ? null : trimmed);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not rename this session." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Append one hand-authored Exercise Prescription to the user's own standalone Session
// (Insert, ADR-0051, issue #360). The client has already mapped the "Add exercise" editor
// into the payload through the pure `buildInsertPrescriptionRequest` view-model, so this is a
// thin transport-and-revalidate shell. On success the Session page is revalidated so the new
// movement renders at the end in place (and shows up in the next Repeat/Start/Log); on failure
// — a Protocol-member target, an unknown exercise, or a `validate_deploy` rejection — the
// server's message is returned for the editor to surface, and nothing is persisted.
export async function submitInsertPrescription(
  sessionId: number,
  input: AuthorPrescriptionInput,
): Promise<InsertPrescriptionFormState> {
  const result = await insertPrescription(sessionId, input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not add this exercise." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Remove one Exercise Prescription from the user's own standalone Session (Remove,
// ADR-0052, Insert's symmetric partner). A thin transport-and-revalidate shell over the
// DELETE seam. On success the Session page is revalidated so the movement disappears and
// the survivors re-number in place (and drop out of the next Repeat/Start/Log); on failure
// — a Protocol-member target, the last-remaining prescription, or a missing position — the
// server's message is returned for the row to surface, and nothing is persisted.
export async function submitRemovePrescription(
  sessionId: number,
  position: number,
): Promise<RemovePrescriptionFormState> {
  const result = await removePrescription(sessionId, position);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not remove this exercise." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Duplicate this Session into a new standalone plan (ADR-0043). On success we redirect
// to the new copy so the user lands on the plan they can tweak and log; on failure —
// e.g. the source is not the user's own Session (404) — the error is returned for the
// button to surface. Duplicate is unlimited, so there is no spent state. `redirect`
// throws to navigate, so it runs after the write and outside any try/catch.
export async function submitDuplicate(
  _prevState: DuplicateFormState,
  form: FormData,
): Promise<DuplicateFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to duplicate." };
  }

  const result = toDuplicateResult(await duplicateSession(sessionId));
  if (!result.ok) {
    return { error: result.error };
  }

  redirect(result.href);
}

// The result the revoke share action returns to the control.
export interface RevokeShareResult {
  ok: boolean;
  error: string | null;
}

// Derive the app's own origin from the request headers, so the Share Link URL is absolute and
// built server-side (where the tested `toShareLinkResult` mapper turns the token into a URL). The
// forwarded proto is honored behind a proxy; host is always present on a real request.
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// Publish (or re-publish) a Share Link on the user's own standalone Session (Share, ADR-0057,
// issue #398). Produces the token server-side and returns the shareable recipient URL for the
// control to display and copy; idempotent while a link is live, so re-sharing yields the same URL.
// A non-owned Session (404) or a Protocol member (409, standalone-only) comes back as an error.
export async function submitShare(sessionId: number): Promise<ShareLinkResult> {
  if (!Number.isInteger(sessionId)) {
    return { ok: false, error: SHARE_FALLBACK_ERROR };
  }
  const origin = await requestOrigin();
  return toShareLinkResult(await createShareLink(sessionId), origin);
}

// Revoke the user's own Share Link for this Session — the off-switch (ADR-0057, issue #398). Stops
// future Redeems only; copies already taken are independent and untouched. On success the control
// drops back to the "Share" state; a non-owned Session (404) comes back as an error.
export async function submitRevokeShare(
  sessionId: number,
): Promise<RevokeShareResult> {
  if (!Number.isInteger(sessionId)) {
    return { ok: false, error: "Could not determine which session to unshare." };
  }
  const result = await revokeShareLink(sessionId);
  if (!result.success || !result.data) {
    return { ok: false, error: result.error ?? "Could not revoke this share link." };
  }
  return { ok: true, error: null };
}

// Swap one prescribed Exercise on the user's own Session copy. On success the
// Session page is revalidated so the new movement renders in place; the swap is
// unlimited and distinct from Regeneration.
export async function submitSubstitute(
  _prevState: SubstituteFormState,
  form: FormData,
): Promise<SubstituteFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  if (!Number.isInteger(sessionId) || !Number.isInteger(position)) {
    return { error: "Could not determine which exercise to substitute." };
  }

  const result = await substitutePrescription(sessionId, position);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not substitute this exercise." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Select a Progression Scheme on this prescription in place (ADR-0064, #432): a no-AI plan
// edit, the same posture as Substitution/Insert/Remove. The hidden `scheme` field carries the
// chosen catalog value; the selector only offers compatible schemes (`scheme-view`), and the
// backend still guards compatibility, so an incompatible choice comes back as the server's
// message. On success the Session page is revalidated so the plan reflects the new scheme in
// place. A Protocol member (409) or a non-owned/absent prescription (404) surfaces the server's
// message for the control, and nothing is persisted.
export async function submitChooseScheme(
  _prevState: SchemeFormState,
  form: FormData,
): Promise<SchemeFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  if (!Number.isInteger(sessionId) || !Number.isInteger(position)) {
    return { error: "Could not determine which movement to update." };
  }

  const scheme =
    typeof form.get("scheme") === "string" ? String(form.get("scheme")) : "";
  if (scheme === "") {
    return { error: "Choose a progression scheme." };
  }

  const result = await chooseScheme(sessionId, position, scheme);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not set this progression scheme." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Clear the Progression Scheme selection — `submitChooseScheme`'s inverse (ADR-0064, #432).
// Restores the movement to the default (Double Progression) with no effect on past records. On
// success the Session page is revalidated so the plan drops back to the default; a Protocol
// member (409) or missing prescription (404) surfaces the server's message.
export async function submitClearScheme(
  _prevState: SchemeFormState,
  form: FormData,
): Promise<SchemeFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  if (!Number.isInteger(sessionId) || !Number.isInteger(position)) {
    return { error: "Could not determine which movement to update." };
  }

  const result = await clearScheme(sessionId, position);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not reset this progression scheme." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}

// Accept the harder-Variation offer at the pure-bodyweight rep ceiling (#202):
// advance this prescription's movement to the suggested Variation through the same
// user-initiated Substitution flow, carrying its `target_exercise_id`. Declining is
// a client-only dismissal that never reaches here, so no write happens on decline.
export async function submitAdvanceVariation(
  _prevState: SubstituteFormState,
  form: FormData,
): Promise<SubstituteFormState> {
  const sessionId = Number(form.get("session_id"));
  const position = Number(form.get("position"));
  const targetExerciseId = Number(form.get("target_exercise_id"));
  if (
    !Number.isInteger(sessionId) ||
    !Number.isInteger(position) ||
    !Number.isInteger(targetExerciseId)
  ) {
    return { error: "Could not determine which Variation to advance to." };
  }

  const result = await substitutePrescription(
    sessionId,
    position,
    targetExerciseId,
  );
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not advance to this Variation." };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { error: null };
}
