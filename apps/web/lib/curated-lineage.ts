// Curated lineage (ADR-0130, issue #688): which Curated Protocol, and which version, a plan
// was adopted from. An immutable plan property the server carries on the Protocol and Session
// reads, unchanged through Duplicate and Redeem; `name` is the Curated Protocol's name as
// adopted, so a later rename never relabels an existing copy. Null on a plan adopted from a
// Generated Protocol or authored by hand.
export interface CuratedLineage {
  identifier: string;
  version: number;
  name: string;
}

// The "Based on <name>" label a Protocol or Session read shows under its title, or null when
// the plan has no curated lineage (or the read omits it). Pure, so it's testable without a
// browser.
export function basedOnLabel(
  lineage: CuratedLineage | null | undefined,
): string | null {
  return lineage ? `Based on ${lineage.name}` : null;
}
