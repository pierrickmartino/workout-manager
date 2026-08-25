import type { WorkoutSession } from "./sessions-types";

// The rename control's view of a Session's name (issue #394). `displayName` is what the
// header shows — the user-given Session Name when set, otherwise the server's derived
// `training_type · date` fallback, so an unnamed Session is never blank. `isUserNamed`
// distinguishes the two so the UI can style/label the fallback as a suggestion rather than
// a real name. `editValue` seeds the rename input — the current name, or empty to author one.
export interface SessionNameView {
  displayName: string;
  isUserNamed: boolean;
  editValue: string;
}

// Map a Session onto its name view. Pure and server-free (types are erased), so the
// name/fallback decision is unit-testable without a browser or the transport seam.
//
// A `name` that is absent, null, or whitespace-only is treated as unset — the Session is
// born unnamed and reads through the fallback (`display_name` from the server, or the bare
// `training_type` as a last resort if a read path omitted it). A real name is trimmed.
export function sessionNameView(session: WorkoutSession): SessionNameView {
  const trimmed = session.name?.trim() ?? "";
  const isUserNamed = trimmed.length > 0;
  const displayName = isUserNamed
    ? trimmed
    : (session.display_name ?? session.training_type);
  return { displayName, isUserNamed, editValue: trimmed };
}
