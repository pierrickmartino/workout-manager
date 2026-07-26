"use server";

import { redirect } from "next/navigation";

import {
  buildAdhocLogRequest,
  readAdhocFormRows,
  type AdhocSetFields,
} from "@/lib/adhoc-log";
import { resolveExercise } from "@/lib/exercises";
import { logAdhocSession } from "@/lib/logs";

export interface AdhocLogFormState {
  error: string | null;
}

// Records a plan-less performance (ADR-0031) from the ad-hoc form. The form is a
// dynamic list of rows (a run, an interval set, some squats — heterogeneous kinds in
// one Logged Session): each row's movement is resolved to a catalog Exercise by name —
// search-and-create (ADR-0033), which returns an existing entry or mints a
// `user_entered` one — so every set posts a real `exercise_id`, exactly like a
// plan-backed set. The request shape (date, known training type, at least one performed
// set, no Completion Outcome) is validated by the shared `buildAdhocLogRequest`
// view-model; row parsing lives in the pure `readAdhocFormRows` seam.
export async function submitAdhocLog(
  _prevState: AdhocLogFormState,
  form: FormData,
): Promise<AdhocLogFormState> {
  const rows = readAdhocFormRows(form);
  if (rows.length === 0) {
    return { error: "Name the movement you performed." };
  }

  // Resolve each movement to a catalog Exercise id before building the request.
  const sets: AdhocSetFields[] = [];
  for (const { movementName, fields } of rows) {
    const resolved = await resolveExercise(movementName);
    if (!resolved.success || !resolved.data) {
      return {
        error: resolved.error ?? `Could not find or create "${movementName}".`,
      };
    }
    sets.push({ exerciseId: resolved.data.id, ...fields });
  }

  const built = buildAdhocLogRequest({
    performedOn: String(form.get("performed_on") ?? ""),
    trainingType: String(form.get("training_type") ?? ""),
    sets,
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
