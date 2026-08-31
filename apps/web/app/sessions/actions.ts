"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  TRAINING_TYPES,
  generateSession,
  type GenerateSessionInput,
} from "@/lib/sessions";
import { requestSessionDelete } from "@/app/sessions/delete-request";

export interface GenerateFormState {
  error: string | null;
}

export interface DeleteSessionRowState {
  error: string | null;
}

// Permanently delete one of the user's own standalone Sessions from the My Sessions library
// (Delete, ADR-0063). Unlike the detail-page delete, the user stays on My Sessions, so this
// revalidates `/sessions` to re-render the library with the row gone (its client-side search /
// favorites filter state is preserved). On failure — the Session has logged training (409), is a
// Protocol member (409), or is not the user's (404) — the server's message is returned for the
// row's confirm control to surface, and nothing is deleted. The library only offers this on rows
// with no logged training; the server guard is the authority on a race. Shares the parse-guard-call
// body with the detail-page action via `requestSessionDelete`; only the on-success step differs.
export async function submitDeleteSessionRow(
  _prevState: DeleteSessionRowState,
  form: FormData,
): Promise<DeleteSessionRowState> {
  const error = await requestSessionDelete(form);
  if (error) {
    return { error };
  }

  revalidatePath("/sessions");
  return { error: null };
}

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Split a free-text equipment list (comma- or newline-separated) into a clean
// array, dropping blanks.
function equipmentList(form: FormData): string[] {
  return text(form, "equipment")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toInput(form: FormData): GenerateSessionInput | null {
  const trainingType = text(form, "training_type");
  if (!VALID_TRAINING_TYPES.has(trainingType)) return null;

  const duration = Number(text(form, "duration_minutes"));
  if (!Number.isInteger(duration) || duration < 1) return null;

  return {
    training_type: trainingType,
    duration_minutes: duration,
    equipment: equipmentList(form),
  };
}

export async function submitGenerate(
  _prevState: GenerateFormState,
  form: FormData,
): Promise<GenerateFormState> {
  const input = toInput(form);
  if (input === null) {
    return { error: "Pick a training type and a duration of at least 1 minute." };
  }

  const result = await generateSession(input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not generate your session." };
  }

  redirect(`/sessions/${result.data.id}`);
}
