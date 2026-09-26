"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteExerciseAction } from "@/app/admin/exercises/actions";
import { deleteControlView } from "@/lib/admin-exercise-delete";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";

// The guarded hard-delete control on the admin Exercise editor (issue #507, ADR-0076). A
// permanent, irreversible removal offered **only** when the movement is Retired and wholly
// unreferenced (retire-then-delete). A thin Client Component — the enablement and copy live
// in the pure `deleteControlView` (unit-tested without a browser), and the backend is the real
// gate (`require_admin`, and it re-checks the guard, returning 409 if unmet). The control is
// disabled with the blocking reason shown until the guard is met; a confirm guards the click;
// on success the row is gone, so it navigates back to the catalog rather than 404-ing here.
export function AdminExerciseDelete({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  const view = deleteControlView(exercise.retired, exercise.reference_count);

  function remove(): void {
    setError(null);
    if (!window.confirm(view.confirmMessage)) return;
    startDeleting(async () => {
      try {
        const result = await deleteExerciseAction(exercise.id);
        if (!result.deleted) {
          setError(result.error ?? "Could not delete the exercise.");
          return;
        }
        // The Exercise no longer exists; leaving the admin on its editor would 404. Send them
        // back to the catalog, which the action has already revalidated.
        router.push("/admin/exercises");
      } catch {
        setError("Could not delete the exercise. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Delete</SectionHeader>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        {view.description}
      </p>

      {view.blockingReason ? (
        <Alert tone="info">{view.blockingReason}</Alert>
      ) : null}
      {error ? <Alert announce tone="error">{error}</Alert> : null}

      <Button
        type="button"
        variant="destructive"
        disabled={!view.canDelete || isDeleting}
        title={view.blockingReason ?? undefined}
        onClick={remove}
        className="self-start"
      >
        {isDeleting ? view.busyLabel : view.actionLabel}
      </Button>
    </div>
  );
}
