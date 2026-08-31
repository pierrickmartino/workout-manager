import { deleteSession } from "@/lib/sessions";

// The shared body of the two Delete server actions (Delete, ADR-0063): parse the target id,
// call the delete seam, and return the server's error message — or `null` on success. The two
// actions differ only in what they do *after* success (the detail page redirects to My Sessions;
// the library row revalidates in place), so that split stays in each action while this common
// parse-guard-call lives here (DRY). Not a server action itself — a plain server-side helper the
// "use server" action files call.
export async function requestSessionDelete(
  form: FormData,
): Promise<string | null> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return "Could not determine which session to delete.";
  }

  const result = await deleteSession(sessionId);
  if (!result.success || !result.data) {
    return result.error ?? "Could not delete this session.";
  }

  return null;
}
