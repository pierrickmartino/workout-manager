// The client gate for AI-only Session affordances (ADR-0040, issue #291). Generation
// Feedback ("did the AI give me a good plan?") and Regeneration both assume the AI wrote
// the plan, so they are nonsensical on a Hand-Authored (`user_authored`) Session — the
// backend rejects them there with a 409, and the UI must not offer them in the first
// place. Pure and browser-safe (no server-only imports): the single source of truth any
// AI-affordance control consults, kept in `lib/` so the rule is unit-tested without a
// browser (the twin of the backend's provenance check in `app/routes/sessions.py`).

// Session Provenance is a closed set (CONTEXT: Session Provenance): how a Session's plan
// came to exist. Parallel to an Exercise's Provenance, but a distinct axis on a distinct
// concept — the plan, not the movement.
export const SESSION_PROVENANCE = {
  aiGenerated: "ai_generated",
  userAuthored: "user_authored",
} as const;

export type SessionProvenance =
  (typeof SESSION_PROVENANCE)[keyof typeof SESSION_PROVENANCE];

// Which AI-only affordances a Session may present. Both are offered only on an
// AI-generated plan; a hand-authored plan shows neither.
export interface AiAffordanceVisibility {
  showGenerationFeedback: boolean;
  showRegeneration: boolean;
}

// Decide affordance visibility from a Session's provenance. A plan is AI-authored exactly
// when its provenance is `ai_generated`; anything else — a `user_authored` plan, an absent
// value (the live read omits it), or an unrecognized value — withholds both affordances,
// the safe posture for a control that only makes sense on a plan the AI actually wrote.
export function aiAffordanceVisibility(
  provenance: string | undefined,
): AiAffordanceVisibility {
  const isAiGenerated = provenance === SESSION_PROVENANCE.aiGenerated;
  return {
    showGenerationFeedback: isAiGenerated,
    showRegeneration: isAiGenerated,
  };
}
