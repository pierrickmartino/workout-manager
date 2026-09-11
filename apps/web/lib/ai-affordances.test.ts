import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aiAffordanceVisibility,
  SESSION_PROVENANCE,
} from "./ai-affordances.ts";

test("shows Generation Feedback and Regeneration on an AI-generated session", () => {
  // Arrange / Act
  const visibility = aiAffordanceVisibility(SESSION_PROVENANCE.aiGenerated);

  // Assert — the AI wrote this plan, so both plan-quality affordances are offered.
  assert.deepEqual(visibility, {
    showGenerationFeedback: true,
    showRegeneration: true,
  });
});

test("hides both AI-only affordances on a hand-authored session", () => {
  // Arrange / Act
  const visibility = aiAffordanceVisibility(SESSION_PROVENANCE.userAuthored);

  // Assert — "did the AI give me a good plan?" and "redo it" are nonsensical on a plan
  // the user wrote by hand (ADR-0040), matching the backend's 409 rejection.
  assert.deepEqual(visibility, {
    showGenerationFeedback: false,
    showRegeneration: false,
  });
});

test("hides both affordances when provenance is absent (e.g. the live read)", () => {
  // Arrange / Act — the live hydration read omits session-level provenance.
  const visibility = aiAffordanceVisibility(undefined);

  // Assert — never offer an AI-only affordance on a plan whose AI origin is unknown.
  assert.deepEqual(visibility, {
    showGenerationFeedback: false,
    showRegeneration: false,
  });
});

test("hides both affordances for an unrecognized provenance value", () => {
  // Arrange / Act
  const visibility = aiAffordanceVisibility("something_unexpected");

  // Assert — only a positively AI-generated plan unlocks the affordances.
  assert.deepEqual(visibility, {
    showGenerationFeedback: false,
    showRegeneration: false,
  });
});
