// Pure view-model for the set-aside note (ADR-0125, amending ADR-0037). NO I/O and NO
// server-only imports, so it is safe to import from both Server and Client Components and
// is unit-testable in isolation.
//
// Generating a new Protocol supersedes the Current one (ADR-0030 selection rule): the old
// Protocol is *set aside* — still owned, records intact, and since ADR-0125 one Switch away
// from being Current again. Superseding is no longer a one-way door, so generation asks
// nothing first; once the new Protocol is adopted, a short non-blocking note says where the
// old one went. The adopted Protocol's address carries the set-aside id so the detail page
// can say so; this module owns both ends of that hand-off.

import type { ProtocolProgress } from "./protocols-types";

// The search parameter naming the Protocol a generation set aside.
export const SET_ASIDE_PARAM = "set_aside";

// Where generation lands: the adopted Protocol, carrying the one it set aside when there
// was a Current Protocol to supersede.
export function adoptedProtocolHref(
  protocolId: number,
  setAsideId: number | null,
): string {
  const base = `/protocols/${protocolId}`;
  return setAsideId === null ? base : `${base}?${SET_ASIDE_PARAM}=${setAsideId}`;
}

// The Protocol id a detail page should look up for the note, or `null` when the address
// names none worth reading: absent, repeated, not a positive integer, or the Protocol on
// screen (a Protocol cannot have set itself aside).
export function parseSetAsideParam(
  raw: string | readonly string[] | undefined,
  viewedProtocolId: number,
): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id === viewedProtocolId) return null;
  return id;
}

// The label the note names (the Protocol's resolved display label, ADR-0021), or `null` when
// there is nothing true to say: the set-aside Protocol could not be read (not owned, deleted
// since, failed read), or it is Current again.
export function setAsideLabel(
  setAside: ProtocolProgress | null,
  currentProtocolId: number | null,
): string | null {
  if (setAside === null || setAside.id === currentProtocolId) return null;
  return setAside.label;
}
