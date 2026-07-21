// Shared harder-Variation offer view helpers. This module has NO server-only
// imports, so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/sessions.ts`.

// The backend's harder-Variation offer for one Prescription: the catalog Exercise
// to advance to at the pure-bodyweight rep ceiling (#202), or `null` when there is
// no harder Variation on file and the prescription holds.
export interface SuggestedVariation {
  exercise_id: number;
  name: string;
}

// How the harder-Variation offer renders:
// - `none`: no offer — the prescription holds at its ceiling, nothing is shown;
// - `offer`: advance to the named harder Variation via the Substitution flow.
//   `exerciseId` is what the accept POST sends back as `target_exercise_id`;
//   the copy fields are the honest, ready-to-render strings for the thin card.
export type HarderVariationOffer =
  | { kind: "none" }
  | {
      kind: "offer";
      exerciseId: number;
      name: string;
      headline: string;
      body: string;
      acceptLabel: string;
      dismissLabel: string;
    };

// Decide whether — and how — to offer the next harder Variation. A `null`
// suggestion means the backend found none to advance to, so nothing renders.
export function toHarderVariationOffer(
  suggestion: SuggestedVariation | null | undefined,
): HarderVariationOffer {
  if (!suggestion) return { kind: "none" };

  const name = suggestion.name.trim();
  if (name.length === 0 || !Number.isInteger(suggestion.exercise_id)) {
    return { kind: "none" };
  }

  return {
    kind: "offer",
    exerciseId: suggestion.exercise_id,
    name,
    headline: "Ready to progress this movement",
    body: `You're topping out the rep range. Advance to ${name} for a harder Variation.`,
    acceptLabel: `Advance to ${name}`,
    dismissLabel: "Not yet",
  };
}
