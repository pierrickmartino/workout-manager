import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAppearanceView, MODE_OPTIONS } from "./appearance-view.ts";
import { DEFAULT_MODE, type Mode } from "./theme.ts";

// `buildAppearanceView` is the pure mapper the Profile Appearance section renders
// from: given the user's current Mode it produces the Light/Dark/System options
// with exactly one marked `selected`. It is pure (no I/O), so it is unit-tested
// over its inputs/outputs without rendering React (prior art:
// apps/web/lib/achievements-view.test.ts).

test("offers Light, Dark, and System — the Mode options for everyone", () => {
  // Arrange / Act
  const view = buildAppearanceView("dark");

  // Assert — the three closed Modes, in a stable catalog order
  assert.deepEqual(
    view.modeOptions.map((option) => option.value),
    ["light", "dark", "system"],
  );
});

test("marks exactly the current Mode as selected", () => {
  // Arrange / Act
  const view = buildAppearanceView("light");

  // Assert — Light is active, the other two are not
  const selected = view.modeOptions.filter((option) => option.selected);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].value, "light");
});

test("reflects a System selection", () => {
  // Arrange / Act
  const view = buildAppearanceView("system");

  // Assert
  const selected = view.modeOptions.find((option) => option.selected);
  assert.equal(selected?.value, "system");
});

test("every Mode can be the selected one", () => {
  // Arrange — drive the mapper across all three Modes
  const modes: Mode[] = ["light", "dark", "system"];

  for (const mode of modes) {
    // Act
    const view = buildAppearanceView(mode);

    // Assert — the selected option is always exactly the input Mode
    const selectedValues = view.modeOptions
      .filter((option) => option.selected)
      .map((option) => option.value);
    assert.deepEqual(selectedValues, [mode]);
  }
});

test("carries a human label and caption for each option", () => {
  // Arrange / Act
  const view = buildAppearanceView(DEFAULT_MODE);

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
