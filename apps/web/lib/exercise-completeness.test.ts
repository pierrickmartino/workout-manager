import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_COMPLETENESS,
  completenessBadge,
} from "./exercise-completeness.ts";

test("presents the gold Enriched tier as a filled violet badge", () => {
  // Arrange / Act
  const badge = completenessBadge(CATALOG_COMPLETENESS.enriched);

  // Assert — a distinct violet pill (not the cyan/magenta Provenance palette) so the
  // two axes read as separate.
  assert.equal(badge?.label, "ENRICHED");
  assert.equal(badge?.variant, "violet");
});

test("presents the Listable tier as a muted badge", () => {
  // Arrange / Act
  const badge = completenessBadge(CATALOG_COMPLETENESS.listable);

  // Assert — meets the minimum bar, shown fainter than Enriched.
  assert.equal(badge?.label, "LISTABLE");
  assert.equal(badge?.variant, "muted");
});

test("presents a name-only Stub as the faintest outline badge", () => {
  // Arrange / Act
  const badge = completenessBadge(CATALOG_COMPLETENESS.stub);

  // Assert — sub-bar content reads as a faint outline pill awaiting enrichment.
  assert.equal(badge?.label, "STUB");
  assert.equal(badge?.variant, "outline");
});

test("every state carries an explanatory tooltip", () => {
  // Assert — the title explains the tier, since the micro-label alone is terse.
  for (const state of Object.values(CATALOG_COMPLETENESS)) {
    const badge = completenessBadge(state);
    assert.ok(badge && badge.title.length > 0);
  }
});

test("omits the badge when completeness is absent", () => {
  // Arrange / Act — a read that carries no completeness field.
  const badge = completenessBadge(undefined);

  // Assert — never invent a completeness claim; just show nothing.
  assert.equal(badge, null);
});

test("omits the badge for an unrecognized completeness value", () => {
  // Arrange / Act
  const badge = completenessBadge("gold_plated");

  // Assert — only the three known states render; anything else is omitted, the safe
  // posture (mirrors the AI-affordance gate's handling of an unknown provenance).
  assert.equal(badge, null);
});
