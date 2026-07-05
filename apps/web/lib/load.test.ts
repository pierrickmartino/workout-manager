import { test } from "node:test";
import assert from "node:assert/strict";

import { formatLoad, NO_LOAD, type Load } from "./load.ts";

test("formatLoad shows the stored text of a typed load", () => {
  // Arrange — a percent-of-1RM load as the API serializes it
  const load: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };

  // Act
  const rendered = formatLoad(load);

  // Assert — the display uses the preserved text verbatim
  assert.equal(rendered, "70% 1RM");
});

test("formatLoad falls back to an em dash when no load was recorded", () => {
  // Act / Assert — both null and undefined read as "no load"
  assert.equal(formatLoad(null), NO_LOAD);
  assert.equal(formatLoad(undefined), NO_LOAD);
});
