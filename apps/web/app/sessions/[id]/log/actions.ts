"use server";

import { logSession } from "@/lib/logs";
import type { CompletionOutcome } from "@/lib/logs-types";
import { loggedSetRowsFromForm } from "@/lib/log-session-form";
import { buildLoggedSets } from "@/lib/logged-set";
import { resolveAppearance } from "@/lib/appearance";

export interface LogFormState {
  error: string | null;
  // Set once the log is saved, so the client can navigate away from the form. The action does
  // not redirect itself — the client pushes to History on success — so the form stays a client
  // component that can surface an inline error without a full navigation on failure.
  ok?: boolean;
}

// The client submits only Done (attempted) rows — a skipped set marks its `done` field false,
// so the reader drops it (Model B, Q10). Read the derived Completion Outcome back off the
// form, falling back to `completed` for any missing/unknown value so the action never
// fabricates an outcome the form did not send.
function completionOutcome(form: FormData): CompletionOutcome {
  return form.get("completion_outcome") === "incomplete" ? "incomplete" : "completed";
}

export async function submitLog(
  _prevState: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to log." };
  }

  const performedOn =
    typeof form.get("performed_on") === "string"
      ? String(form.get("performed_on")).trim()
      : "";
  if (performedOn === "") {
    return { error: "Pick the date you performed this session." };
  }

  // Which posted rows count (the Done ones) is this path's rule (`loggedSetRowsFromForm`);
  // building each into a Logged Set is the shared module's (ADR-0115), called with the Done
  // mark so a blank rep count logs as 0. A garbled amount rejects the whole submission.
  // The Load values arrive in the user's Weight Unit; resolve it server-side so each entered
  // Load is stored as canonical kilograms (#417). A signed-out/unreachable read defaults to kg.
  const { weight_unit: unit } = await resolveAppearance();
  const built = buildLoggedSets(loggedSetRowsFromForm(form), unit, { performedMark: true });
  if (!built.ok) {
    return { error: built.error };
  }
  if (built.sets.length === 0) {
    return { error: "Mark at least one set as done to log this session." };
  }

  // The Completion Outcome is derived per-set (Q8, ADR-0045): the form marks each prescribed
  // set done or skipped, and reports Incomplete when any prescribed set was left un-attempted.
  const result = await logSession(sessionId, {
    performed_on: performedOn,
    completion_outcome: completionOutcome(form),
    logged_sets: built.sets,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  // Saved. The client navigates to History (`ok` flips the form's post-save effect).
  return { error: null, ok: true };
}
