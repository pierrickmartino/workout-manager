// Pure view-model transforms for the Home screen. NO I/O and NO server-only
// imports, so this is safe to import from both Server and Client Components (and
// is unit-testable in isolation). The server-only data access lives in
// `lib/home.ts`; the shapes it consumes come from `lib/protocols-types`.

import type { ProtocolProgress, ProtocolSession } from "./protocols-types";

// The Session Hero's headline stats — duration · modules · sets — for a Current
// Protocol's Next Session. Deliberately no target-calorie and no single volume /
// tonnage number: with free-text and percentage-based loads a single volume
// figure would silently mislead (ADR-0008), so the hero shows honest counts.
export interface HeroStats {
  // The Protocol's prescribed per-session duration, in minutes.
  durationMinutes: number;
  // How many Exercise Prescriptions (modules) the Next Session contains.
  modules: number;
  // The total prescribed sets across those Prescriptions.
  sets: number;
}

// Derive the hero stats from a Current Protocol. `modules` counts the Next
// Session's Prescriptions; `sets` sums their prescribed sets; duration is the
// Protocol's own `duration_minutes`. A Current Protocol from `/api/home` always
// carries a Next Session, but the type admits `null`, so an absent one yields
// zeroed counts rather than throwing.
export function heroStats(protocol: ProtocolProgress): HeroStats {
  const next: ProtocolSession | null = protocol.next_session;
  const prescriptions = next?.prescriptions ?? [];
  return {
    durationMinutes: protocol.duration_minutes,
    modules: prescriptions.length,
    sets: prescriptions.reduce((total, p) => total + p.sets, 0),
  };
}
