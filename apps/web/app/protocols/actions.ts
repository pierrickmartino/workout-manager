"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
