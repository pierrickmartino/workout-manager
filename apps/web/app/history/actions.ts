"use server";

import { revalidatePath } from "next/cache";

import { deleteSession } from "@/lib/logs";

export interface DeleteLogState {
  error: string | null;
}

// Delete a mis-logged Logged Session (ADR-0034). The server is authoritative: it resolves
// ownership (`404`) and runs the contiguity gate (`409` when the delete would leave a gap
// in the performed sequence), so a rejection surfaces its message here even though the
// History control is also disabled client-side for the common case. On success the history
// is revalidated so the record — and every projection derived from it — disappears.
export async function deleteLogAction(
  _prevState: DeleteLogState,
  form: FormData,
): Promise<DeleteLogState> {
  const logId = Number(form.get("log_id"));
  if (!Number.isInteger(logId)) {
    return { error: "Could not tell which log to delete." };
  }

  const result = await deleteSession(logId);
  if (!result.success) {
    return { error: result.error ?? "Could not delete this record." };
  }

  revalidatePath("/history");
  return { error: null };
}
