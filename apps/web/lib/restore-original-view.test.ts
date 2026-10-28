import { test } from "node:test";
import assert from "node:assert/strict";

import { restoreOriginalView } from "./restore-original-view.ts";

// When a prescription offers "Restore original" (ADR-0143, #788): only once it has been
// substituted (the read names its Prescribed Original), and only where Substitution itself
// is offered — never on a performed Protocol Session.

test("a substituted prescription offers Restore, naming the original it brings back", () => {
  assert.deepEqual(
    restoreOriginalView(
      { prescribed_original: { exercise_name: "Barbell Back Squat" } },
      { canSubstitute: true },
    ),
    {
      show: true,
      label: "Restore original",
      description: "Back to Barbell Back Squat",
    },
  );
});

test("a never-substituted prescription offers no Restore", () => {
  assert.equal(
    restoreOriginalView({ prescribed_original: null }, { canSubstitute: true }).show,
    false,
  );
});

test("a read without the Prescribed Original field offers no Restore", () => {
  assert.equal(restoreOriginalView({}, { canSubstitute: true }).show, false);
});

test("where Substitution is withheld, Restore is withheld too", () => {
  assert.equal(
    restoreOriginalView(
      { prescribed_original: { exercise_name: "Barbell Back Squat" } },
      { canSubstitute: false },
    ).show,
    false,
  );
});

test("a blank original name still offers Restore, without naming it", () => {
  assert.deepEqual(
    restoreOriginalView(
      { prescribed_original: { exercise_name: "  " } },
      { canSubstitute: true },
    ),
    { show: true, label: "Restore original", description: "Back to the prescribed exercise" },
  );
});
