"use server";

import { redirect } from "next/navigation";

import { buildAdhocLogRequest } from "@/lib/adhoc-log";
import { resolveExercise } from "@/lib/exercises";
import { logAdhocSession } from "@/lib/logs";

export interface AdhocLogFormState {
  error: string | null;
}

// Records a plan-less performance (ADR-0031) from the ad-hoc form. The movement is
// resolved to a catalog Exercise by name first — search-and-create (ADR-0033), which
// returns an existing entry or mints a `user_entered` one — so the log itself posts a
// real `exercise_id`, exactly like a plan-backed set. The request shape (date, known
// training type, at least one performed set, and no Completion Outcome) is validated
// by the shared `buildAdhocLogRequest` view-model.
export async function submitAdhocLog(
  _prevState: AdhocLogFormState,
  form: FormData,
): Promise<AdhocLogFormState> {
  const movementName =
    typeof form.get("movement_name") === "string"
      ? String(form.get("movement_name")).trim()
      : "";
  if (movementName === "") {
    return { error: "Name the movement you performed." };
  }

  const resolved = await resolveExercise(movementName);
  if (!resolved.success || !resolved.data) {
    return { error: resolved.error ?? "Could not find or create that movement." };
  }

  const built = buildAdhocLogRequest({
    performedOn: String(form.get("performed_on") ?? ""),
    trainingType: String(form.get("training_type") ?? ""),
    sets: [
      {
        exerciseId: resolved.data.id,
        reps: String(form.get("reps") ?? ""),
        loadKind: String(form.get("load_kind") ?? ""),
        loadValue: String(form.get("load_value") ?? ""),
      },
    ],
  });
  if (!built.ok) {
    return { error: built.error };
  }

  const result = await logAdhocSession(built.request);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  redirect("/history");
}
