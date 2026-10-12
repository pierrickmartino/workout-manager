"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adoptCuratedProtocol, fetchCuratedProtocols } from "@/lib/curated-protocols";
import { findCuratedProtocol, readAdoptForm } from "@/lib/curated-protocol-view";
import { fetchHome } from "@/lib/home";
import { adoptedProtocolHref } from "@/lib/protocol-supersede";
import {
  deleteProtocol,
  fetchProtocolJob,
  startProtocolGeneration,
  switchToProtocol,
  type GenerateProtocolInput,
  type ProtocolJob,
} from "@/lib/protocols";

// Server actions for the async Protocol generation flow. The Clerk JWT is attached
// server-side in `lib/protocols.ts` and never reaches the browser; the client form
// calls these to submit a generation and then poll the job to completion.

export interface JobResult {
  job: ProtocolJob | null;
  error: string | null;
}

export async function startGeneration(
  input: GenerateProtocolInput,
): Promise<JobResult> {
  const result = await startProtocolGeneration(input);
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not start generation." };
  }
  return { job: result.data, error: null };
}

export async function pollProtocolJob(jobId: string): Promise<JobResult> {
  const result = await fetchProtocolJob(jobId);
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not check generation." };
  }
  return { job: result.data, error: null };
}

export interface SwitchProtocolState {
  error: string | null;
}

// Switch to a set-aside Protocol (issue #638): no confirmation, because Switch is reversible.
// The server is authoritative — it owns the `404` (not owned) and the `409` (Finished) — so a
// refusal surfaces its message inline. On success Home and the index are revalidated and the
// user lands on Home, where the switched-to Protocol's Next Session is waiting.
export async function switchProtocolAction(
  _prevState: SwitchProtocolState,
  form: FormData,
): Promise<SwitchProtocolState> {
  const protocolId = Number(form.get("protocol_id"));
  if (!Number.isInteger(protocolId)) {
    return { error: "Could not tell which protocol to switch to." };
  }

  const result = await switchToProtocol(protocolId);
  if (!result.success) {
    return { error: result.error ?? "Could not switch to this protocol." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/protocols");
  redirect("/dashboard");
}

export interface DeleteProtocolState {
  error: string | null;
}

// Delete an un-started Protocol (issue #639), reached only through the app's own confirmation
// (ADR-0098). The server is authoritative — it owns the `404` (not owned) and the `409` (a
// Session was logged since the index was drawn) — so a refusal surfaces its message inline. On
// success Home and the index are revalidated: deleting the Current Protocol makes Home fall back
// to the next most-recently-Current unfinished one, or to the empty state.
export async function deleteProtocolAction(
  _prevState: DeleteProtocolState,
  form: FormData,
): Promise<DeleteProtocolState> {
  const protocolId = Number(form.get("protocol_id"));
  if (!Number.isInteger(protocolId)) {
    return { error: "Could not tell which protocol to delete." };
  }

  const result = await deleteProtocol(protocolId);
  if (!result.success) {
    return { error: result.error ?? "Could not delete this protocol." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/protocols");
  return { error: null };
}

export interface AdoptCuratedProtocolState {
  error: string | null;
}

// Adopt a Curated Protocol (issue #684). The Curated Protocol is re-read server-side rather than trusted
// from the form, and the form is checked against it before anything is sent; the API is still
// authoritative and recomputes the plan itself. On success the new Protocol is Current, so Home
// and the index are revalidated and the user lands on it, with the same note a generated
// adoption carries saying where the previous Current Protocol went (ADR-0125).
export async function adoptCuratedProtocolAction(
  _prevState: AdoptCuratedProtocolState,
  form: FormData,
): Promise<AdoptCuratedProtocolState> {
  const identifier = String(form.get("identifier") ?? "");
  const list = await fetchCuratedProtocols();
  const curated = findCuratedProtocol(list, identifier);
  if (!curated) {
    return { error: list.error ?? "This Curated Protocol isn’t available." };
  }

  const parsed = readAdoptForm(curated, form);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  // Read before adopting: afterwards Home already reports the new Protocol as Current. A failed
  // read simply omits the note.
  const home = await fetchHome().catch(() => null);
  const setAsideProtocolId = home?.success
    ? (home.data?.current_protocol?.id ?? null)
    : null;

  const result = await adoptCuratedProtocol(identifier, parsed.request);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not adopt this Curated Protocol." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/protocols");
  redirect(adoptedProtocolHref(result.data.protocol_id, setAsideProtocolId));
}
