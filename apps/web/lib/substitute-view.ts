import type { WorkoutSession } from "./sessions-types";

// View-model for the Substitute control on the Session page (#787, ADR-0020, ADR-0143). A
// Protocol Session with any Logged Session behind it is settled history: only the
// un-performed tail of a Protocol is edited, so Substitute is withheld there. "Performed" is
// the read-time Logged Count (any Completion Outcome), the same rule the server's 409 guard
// applies. A standalone Session keeps Substitute whatever its count — a plan edit there only
// reaches future performances. A Protocol Session read without the count can't be decided,
// so the control is withheld (fail closed; the server 409 is the backstop).
export interface SubstituteView {
  show: boolean;
}

export function substituteView(
  session: Pick<WorkoutSession, "is_protocol_member" | "logged_count">,
): SubstituteView {
  if (!session.is_protocol_member) {
    return { show: true };
  }
  return { show: session.logged_count === 0 };
}
