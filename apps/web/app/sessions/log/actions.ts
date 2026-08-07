"use server";

import { redirect } from "next/navigation";

import { authorSession } from "@/lib/sessions";
import type { AuthorSessionInput } from "@/lib/hand-authored-session";

export interface AuthorSessionFormState {
  error: string | null;
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
