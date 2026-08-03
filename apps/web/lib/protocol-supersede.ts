// Pure view-model for the supersede guard (ADR-0037). NO I/O and NO server-only
// imports, so it is safe to import from both Server and Client Components and is
// unit-testable in isolation.
//
// Generating a new Protocol supersedes the Current one (ADR-0030 selection rule):
// the old Protocol is *set aside* — still owned, records intact, but no longer
// surfaced (CONTEXT.md "Current Protocol"). That is a one-way door, so this decides
// whether generation must warn first.

import type { ProtocolProgress } from "./protocols-types";

// The confirmation message to show before superseding the Current Protocol, or
// `null` when superseding is silent (nothing settled would be set aside).
export function supersedeWarning(
  currentProtocol: ProtocolProgress | null,
): string | null {
  // Silent when there is nothing to supersede (empty state) or nothing settled to
  // lose: a Protocol with no advancing Session (ADR-0013) has made zero forward
  // progress, so its Next Session is still the first and superseding costs nothing.
  if (currentProtocol === null || currentProtocol.completed_count <= 0) {
    return null;
  }
  // In progress: warn at the one-way door, naming the Protocol (its resolved display
  // label, ADR-0021) that will be set aside.
  return `You're partway through "${currentProtocol.label}". Starting a new protocol will set it aside — you won't be able to return to it.`;
}
