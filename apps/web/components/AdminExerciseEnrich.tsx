"use client";

import { useState, useTransition } from "react";

import { enrichExerciseAction } from "@/app/admin/exercises/actions";
import { enrichControlView } from "@/lib/admin-exercise-enrich";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";

// The per-Exercise "enrich now" control on the admin Exercise editor (issue #508, ADR-0041). It
// hands this one movement to the same out-of-band Enrichment worker the create flow uses — no AI
// on the request — and reflects that the job was accepted; the fill lands in the background. A
// thin Client Component: the copy lives in the pure `enrichControlView` (unit-tested without a
// browser), and the backend is the real gate (`require_admin`) and the one place enrichment
// runs. This forwards the trigger through the server action and surfaces acceptance or an error.
export function AdminExerciseEnrich({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isQueuing, startQueuing] = useTransition();

  const view = enrichControlView();

  function trigger(): void {
    setError(null);
    setMessage(null);
    startQueuing(async () => {
      try {
        const result = await enrichExerciseAction(exercise.id);
        if (!result.accepted) {
          setError(result.error ?? "Could not queue enrichment.");
          return;
        }
        setMessage(view.acceptedMessage);
      } catch {
        setError("Could not queue enrichment. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Enrichment</SectionHeader>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        {view.description}
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Button
        type="button"
        variant="primary"
        disabled={isQueuing}
        onClick={trigger}
        className="self-start"
      >
        {isQueuing ? view.busyLabel : view.actionLabel}
      </Button>
    </div>
  );
}
