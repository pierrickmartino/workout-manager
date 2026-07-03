"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { pollProtocolJob, startGeneration } from "@/app/protocols/actions";
import type { GenerateProtocolInput } from "@/lib/protocols-types";

// Drives the async Protocol generation flow on the client (Slice 7, ADR-0005):
// submit, then poll the job to completion and navigate to the adopted Protocol. A
// cache hit short-circuits straight to navigation; a miss/bypass shows progress
// while the worker runs, so a long multi-week generation never blocks the UI.

export type GenerationPhase = "idle" | "submitting" | "generating" | "error";

const POLL_INTERVAL_MS = 1500;

interface ProtocolGeneration {
  phase: GenerationPhase;
  error: string | null;
  start: (input: GenerateProtocolInput) => Promise<void>;
}

export function useProtocolGeneration(): ProtocolGeneration {
  const router = useRouter();
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const goToProtocol = useCallback(
    (protocolId: number) => {
      router.push(`/protocols/${protocolId}`);
    },
    [router],
  );

  const start = useCallback(
    async (input: GenerateProtocolInput) => {
      setError(null);
      setPhase("submitting");
      const result = await startGeneration(input);
      if (!result.job) {
        setError(result.error);
        setPhase("error");
        return;
      }
      if (result.job.protocol_id !== null) {
        goToProtocol(result.job.protocol_id); // cache hit — instant
        return;
      }
      setJobId(result.job.job_id);
      setPhase("generating");
    },
    [goToProtocol],
  );

  useEffect(() => {
    if (phase !== "generating" || !jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async (): Promise<void> => {
      const result = await pollProtocolJob(jobId);
      if (cancelled) return;

      if (!result.job || result.job.status === "failed") {
        setError(result.job?.error ?? result.error ?? "Generation failed.");
        setPhase("error");
        return;
      }
      if (result.job.status === "complete" && result.job.protocol_id !== null) {
        goToProtocol(result.job.protocol_id);
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS); // still pending — keep polling
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, jobId, goToProtocol]);

  return { phase, error, start };
}
