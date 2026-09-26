"use client";

import { useState, useTransition } from "react";

import { setRetiredAction } from "@/app/admin/exercises/actions";
import { retireControlView } from "@/lib/admin-exercise-retire";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The Retire / un-Retire control on the admin Exercise editor (issue #506, ADR-0076). A
// reversible soft tombstone the admin flips: retiring hides the movement from every discovery
// surface while it stays resolvable by id, and only an admin un-retires. A thin Client
// Component — the copy and target state live in the pure `retireControlView` (unit-tested
// without a browser), and the backend is the real gate (`require_admin`) and audits the act.
// This holds the retired flag locally, forwards the flip through the server action, and
// re-baselines to the saved state so the button flips direction without a full reload.
export function AdminExerciseRetire({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [retired, setRetired] = useState(exercise.retired);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const view = retireControlView(retired);

  function flip(): void {
    setError(null);
    setMessage(null);
    startSaving(async () => {
      try {
        const result = await setRetiredAction(exercise.id, view.nextRetired);
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not update the exercise.");
          return;
        }
        setRetired(result.exercise.retired);
        setMessage(view.successMessage);
      } catch {
        setError("Could not update the exercise. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Retire</SectionHeader>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-text-muted">Status</span>
        <Badge variant={retired ? "magenta" : "cyan"}>{view.statusLabel}</Badge>
      </div>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        {view.description}
      </p>

      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {message ? <Alert announce tone="success">{message}</Alert> : null}

      <Button
        type="button"
        variant={retired ? "primary" : "destructive"}
        disabled={isSaving}
        onClick={flip}
        className="self-start"
      >
        {isSaving ? view.busyLabel : view.actionLabel}
      </Button>
    </div>
  );
}
