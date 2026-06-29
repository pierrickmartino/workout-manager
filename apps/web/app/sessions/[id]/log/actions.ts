"use server";

import { redirect } from "next/navigation";

import { logSession, type LogSetInput } from "@/lib/logs";

export interface LogFormState {
  error: string | null;
}

const MIN_RPE = 1;
const MAX_RPE = 10;

function strings(form: FormData, name: string): string[] {
  return form.getAll(name).map((value) => (typeof value === "string" ? value.trim() : ""));
}

// Build the per-set payload from the row-aligned form fields, skipping rows the
// user left without reps (exercises they didn't perform).
function loggedSets(form: FormData): LogSetInput[] {
  const exerciseIds = strings(form, "exercise_id");
  const reps = strings(form, "reps");
  const loads = strings(form, "load");
  const rpes = strings(form, "rpe");

  const sets: LogSetInput[] = [];
  for (let row = 0; row < exerciseIds.length; row += 1) {
    if (reps[row] === "") continue;

    const repsValue = Number(reps[row]);
    if (!Number.isInteger(repsValue) || repsValue < 0) continue;

    const exerciseId = Number(exerciseIds[row]);
    if (!Number.isInteger(exerciseId)) continue;

    const rpeValue = rpes[row] === "" ? null : Number(rpes[row]);
    const perceivedDifficulty =
      rpeValue !== null && Number.isInteger(rpeValue) && rpeValue >= MIN_RPE && rpeValue <= MAX_RPE
        ? rpeValue
        : null;

    sets.push({
      exercise_id: exerciseId,
      reps: repsValue,
      load: loads[row] === "" ? null : loads[row],
      perceived_difficulty: perceivedDifficulty,
    });
  }
  return sets;
}

export async function submitLog(
  _prevState: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to log." };
  }

  const performedOn = typeof form.get("performed_on") === "string" ? String(form.get("performed_on")).trim() : "";
  if (performedOn === "") {
    return { error: "Pick the date you performed this session." };
  }

  const sets = loggedSets(form);
  if (sets.length === 0) {
    return { error: "Enter the reps for at least one exercise you performed." };
  }

  const result = await logSession(sessionId, {
    performed_on: performedOn,
    logged_sets: sets,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  redirect("/history");
}
