"use server";

import {
  fetchProgramJob,
  startProgramGeneration,
  type GenerateProgramInput,
  type ProgramJob,
} from "@/lib/programs";

// Server actions for the async Program generation flow. The Clerk JWT is attached
// server-side in `lib/programs.ts` and never reaches the browser; the client form
// calls these to submit a generation and then poll the job to completion.

export interface JobResult {
  job: ProgramJob | null;
  error: string | null;
}

export async function startGeneration(
  input: GenerateProgramInput,
): Promise<JobResult> {
  const result = await startProgramGeneration(input);
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not start generation." };
  }
  return { job: result.data, error: null };
}

export async function pollProgramJob(jobId: string): Promise<JobResult> {
  const result = await fetchProgramJob(jobId);
  if (!result.success || !result.data) {
    return { job: null, error: result.error ?? "Could not check generation." };
  }
  return { job: result.data, error: null };
}
