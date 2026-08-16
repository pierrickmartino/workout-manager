import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAppearanceView,
  buildSkinControl,
  MODE_OPTIONS,
  SKIN_OPTIONS,
} from "./appearance-view.ts";
import { DEFAULT_MODE, KNOWN_SKINS, type Mode } from "./theme.ts";

// `buildAppearanceView` is the pure, per-role mapper the Profile Appearance section
// renders from. Given the user's Mode plus their admin context it produces the
// Light/Dark/System options for everyone and — for an admin only — the Skin catalog
// with preview/publish state. It is pure (no I/O), so it is unit-tested over its
// inputs/outputs without rendering React (prior art:
// apps/web/lib/achievements-view.test.ts).

// ── Mode slice: everyone ────────────────────────────────────────────────────

test("offers Light, Dark, and System — the Mode options for everyone", () => {
  // Arrange / Act
  const view = buildAppearanceView({ mode: "dark", isAdmin: false, activeSkin: "pulse" });

  // Assert — the three closed Modes, in a stable catalog order
  assert.deepEqual(
    view.modeOptions.map((option) => option.value),
    ["light", "dark", "system"],
  );
});

test("marks exactly the current Mode as selected", () => {
  // Arrange / Act
  const view = buildAppearanceView({ mode: "light", isAdmin: false, activeSkin: "pulse" });

  // Assert — Light is active, the other two are not
  const selected = view.modeOptions.filter((option) => option.selected);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].value, "light");
});

test("reflects a System selection", () => {
  // Arrange / Act
  const view = buildAppearanceView({ mode: "system", isAdmin: false, activeSkin: "pulse" });

  // Assert
  const selected = view.modeOptions.find((option) => option.selected);
  assert.equal(selected?.value, "system");
});

test("every Mode can be the selected one", () => {
  // Arrange — drive the mapper across all three Modes
  const modes: Mode[] = ["light", "dark", "system"];

  for (const mode of modes) {
    // Act
    const view = buildAppearanceView({ mode, isAdmin: false, activeSkin: "pulse" });

    // Assert — the selected option is always exactly the input Mode
    const selectedValues = view.modeOptions
      .filter((option) => option.selected)
      .map((option) => option.value);
    assert.deepEqual(selectedValues, [mode]);
  }
});

test("carries a human label and caption for each Mode option", () => {
  // Arrange / Act
  const view = buildAppearanceView({ mode: DEFAULT_MODE, isAdmin: false, activeSkin: "pulse" });

  // Assert — every option is renderable copy, no empty strings
  for (const option of view.modeOptions) {
    assert.ok(option.label.length > 0);
    assert.ok(option.caption.length > 0);
  }
});

test("MODE_OPTIONS is the single source of the Mode catalog order", () => {
  // Assert — the exported catalog and the view agree on the closed set + order
  assert.deepEqual(
    MODE_OPTIONS.map((option) => option.value),
    ["light", "dark", "system"],
  );
});

// ── Per-role branch: admin gets the Skin slice, a non-admin does not ─────────

test("a non-admin gets only the Mode options — no Skin control", () => {
  // Arrange / Act — an ordinary user, whatever the active/preview Skin is
  const view = buildAppearanceView({
    mode: "dark",
    isAdmin: false,
    activeSkin: "pulse",
    previewSkin: "aurora",
  });

  // Assert — the Skin catalog is not their control to see
  assert.equal(view.skinControl, null);
  assert.ok(view.modeOptions.length > 0);
});

test("an admin additionally gets the Skin list and preview/publish state", () => {
  // Arrange / Act — no preview yet, so preview == active
  const view = buildAppearanceView({
    mode: "dark",
    isAdmin: true,
    activeSkin: "pulse",
    previewSkin: "pulse",
  });

  // Assert — the Skin control exists and still carries the Mode options
  assert.ok(view.skinControl);
  assert.deepEqual(
    view.skinControl?.options.map((option) => option.value),
    ["pulse", "aurora"],
  );
  assert.ok(view.modeOptions.length > 0);
});

// ── Skin slice details (buildSkinControl) ────────────────────────────────────

test("with no active preview, the Active Skin is marked active and nothing previews", () => {
  // Arrange / Act — preview equals the published Active Skin
  const control = buildSkinControl("pulse", "pulse");

  // Assert — pulse is Active, nothing is previewing, publish/cancel are inert
  const pulse = control.options.find((option) => option.value === "pulse");
  assert.equal(pulse?.isActive, true);
  assert.equal(pulse?.isPreviewing, false);
  assert.equal(control.isPreviewing, false);
  assert.equal(control.canPublish, false);
  assert.equal(control.canCancel, false);
});

test("previewing a different Skin distinguishes it from the published Active Skin", () => {
  // Arrange / Act — active is pulse, admin previews aurora
  const control = buildSkinControl("pulse", "aurora");

  // Assert — pulse stays the Active one; aurora is the (unpublished) preview
  const pulse = control.options.find((option) => option.value === "pulse");
  const aurora = control.options.find((option) => option.value === "aurora");
  assert.equal(pulse?.isActive, true);
  assert.equal(pulse?.isPreviewing, false);
  assert.equal(aurora?.isActive, false);
  assert.equal(aurora?.isPreviewing, true);

  // A preview is pending, so it can be published or cancelled
  assert.equal(control.isPreviewing, true);
  assert.equal(control.canPublish, true);
  assert.equal(control.canCancel, true);
  assert.equal(control.previewSkin, "aurora");
  assert.equal(control.activeSkin, "pulse");
});

test("exactly one Skin is the Active one and at most one is previewing", () => {
  // Arrange / Act
  const control = buildSkinControl("aurora", "pulse");

  // Assert
  assert.equal(
    control.options.filter((option) => option.isActive).length,
    1,
  );
  assert.equal(
    control.options.filter((option) => option.isPreviewing).length,
    1,
  );
});

test("every Skin option carries renderable label + caption copy", () => {
  // Arrange / Act
  const control = buildSkinControl("pulse", "pulse");

  // Assert
  for (const option of control.options) {
    assert.ok(option.label.length > 0);
    assert.ok(option.caption.length > 0);
  }
});

test("SKIN_OPTIONS is the single source of the Skin catalog and cannot drift from KNOWN_SKINS", () => {
  // Assert — the display catalog covers exactly the canonical Skin ids, in order
  assert.deepEqual(
    SKIN_OPTIONS.map((option) => option.value),
    [...KNOWN_SKINS],
  );
});
