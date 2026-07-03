"use server";

import {
  fetchProtocolJob,
  startProtocolGeneration,
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
