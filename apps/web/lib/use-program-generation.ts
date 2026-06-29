"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { pollProgramJob, startGeneration } from "@/app/programs/actions";
import type { GenerateProgramInput } from "@/lib/programs-types";

// Drives the async Program generation flow on the client (Slice 7, ADR-0005):
// submit, then poll the job to completion and navigate to the adopted Program. A
// cache hit short-circuits straight to navigation; a miss/bypass shows progress
// while the worker runs, so a long multi-week generation never blocks the UI.

export type GenerationPhase = "idle" | "submitting" | "generating" | "error";

const POLL_INTERVAL_MS = 1500;

interface ProgramGeneration {
  phase: GenerationPhase;
  error: string | null;
  start: (input: GenerateProgramInput) => Promise<void>;
}

export function useProgramGeneration(): ProgramGeneration {
  const router = useRouter();
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const goToProgram = useCallback(
    (programId: number) => {
      router.push(`/programs/${programId}`);
    },
    [router],
  );

  const start = useCallback(
    async (input: GenerateProgramInput) => {
      setError(null);
      setPhase("submitting");
      const result = await startGeneration(input);
      if (!result.job) {
        setError(result.error);
        setPhase("error");
        return;
      }
      if (result.job.program_id !== null) {
        goToProgram(result.job.program_id); // cache hit — instant
        return;
      }
      setJobId(result.job.job_id);
      setPhase("generating");
    },
    [goToProgram],
  );

  useEffect(() => {
    if (phase !== "generating" || !jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async (): Promise<void> => {
      const result = await pollProgramJob(jobId);
      if (cancelled) return;

      if (!result.job || result.job.status === "failed") {
        setError(result.job?.error ?? result.error ?? "Generation failed.");
        setPhase("error");
        return;
      }
      if (result.job.status === "complete" && result.job.program_id !== null) {
        goToProgram(result.job.program_id);
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS); // still pending — keep polling
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, jobId, goToProgram]);

  return { phase, error, start };
}
