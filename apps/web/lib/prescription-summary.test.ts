import { test } from "node:test";
import assert from "node:assert/strict";

import {
  prescriptionSummaryChips,
  restSecondsFromInput,
  shouldAutoExpand,
} from "./prescription-summary.ts";

// `prescription-summary` is the Prescription Summary read-time projection (CONTEXT: Prescription
// Summary; ADR-0067, #465) — the pure view-model behind a collapsed Exercise Prescription card.
// It renders compact chips for only the *advanced* values that differ from their default, and it
// decides whether a freshly-rendered card opens expanded (so nothing meaningful is hidden on
// first view). At this slice the advanced fields present are **Tempo** and **Rest**; later slices
// extend the same seam with Target Effort, Set Type, and the Exercise Note.
//
// These tests assert the data a reader sees — the ordered chips and the auto-expand decision —
// never any component internals or the ephemeral open/closed toggle. Prior art: `scheme-preview`
// and `note-view`. AAA structure with behavior-describing names.

test("a plain set with no advanced values summarizes to no chips", () => {
  // Arrange
  const fields = { tempo: null, restSeconds: null };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.deepEqual(chips, []);
});

test("a non-default Tempo renders as its three-state label, not the raw code", () => {
  // Arrange — 3-1-1 classifies as a Controlled tempo.
  const fields = { tempo: "3-1-1", restSeconds: null };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Controlled");
});

test("an explosive Tempo reads as its Explosive label", () => {
  const chips = prescriptionSummaryChips({ tempo: "1-0-X", restSeconds: null });

  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Explosive");
});

test("a deliberately slow Tempo reads as its Slow label", () => {
  const chips = prescriptionSummaryChips({ tempo: "4-1-1", restSeconds: null });

  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Slow");
});

test("an unparseable Tempo falls back to its raw code", () => {
  // Arrange — free text is not 3-/4-token notation, so there is no three-state label.
  const fields = { tempo: "explosive", restSeconds: null };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "explosive");
});

test("a blank Tempo string is the unset default and shows no chip", () => {
  const chips = prescriptionSummaryChips({ tempo: "   ", restSeconds: null });

  assert.deepEqual(chips, []);
});

test("a non-null Rest renders a `90s rest` chip", () => {
  // Arrange
  const fields = { tempo: null, restSeconds: 90 };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "90s rest");
});

test("a zero-second Rest is a deliberate value and still renders a chip", () => {
  const chips = prescriptionSummaryChips({ tempo: null, restSeconds: 0 });

  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "0s rest");
});

test("a non-working Set Type renders its label as a chip", () => {
  // Arrange — a warm-up is a non-default Set Type, so it earns a chip.
  const fields = { tempo: null, restSeconds: null, setType: "warm_up" };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Warm-up");
});

test("every non-working Set Type reads as its own label", () => {
  assert.equal(prescriptionSummaryChips({ setType: "drop" })[0].label, "Drop set");
  assert.equal(
    prescriptionSummaryChips({ setType: "failure" })[0].label,
    "To failure",
  );
  assert.equal(prescriptionSummaryChips({ setType: "amrap" })[0].label, "AMRAP");
});

test("a working Set Type is the default and shows no chip", () => {
  // The quiet case: an ordinary working set carries no redundant "working" badge.
  assert.deepEqual(prescriptionSummaryChips({ setType: "working" }), []);
});

test("an unset Set Type shows no chip", () => {
  // Null, undefined, or omitted all read as the working default → no chip.
  assert.deepEqual(prescriptionSummaryChips({ setType: null }), []);
  assert.deepEqual(prescriptionSummaryChips({ setType: undefined }), []);
});

test("an unknown Set Type value resolves to working and shows no chip", () => {
  // A legacy/foreign value reads as the default rather than a fabricated label.
  assert.deepEqual(prescriptionSummaryChips({ setType: "superset" }), []);
});

test("chips are ordered Tempo, Rest, then Set Type", () => {
  // Arrange — a set carrying a tempo, a rest, and a non-working Set Type.
  const fields = { tempo: "3-1-1", restSeconds: 90, setType: "amrap" };

  // Act
  const chips = prescriptionSummaryChips(fields);

  // Assert
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["Controlled", "90s rest", "AMRAP"],
  );
});

test("the Set Type chip carries a stable key and a spoken aria label", () => {
  const [chip] = prescriptionSummaryChips({ setType: "warm_up" });

  assert.equal(chip.key, "set-type");
  assert.ok(chip.ariaLabel.includes("Warm-up"));
});

test("each chip carries a stable key and a spoken aria label", () => {
  const chips = prescriptionSummaryChips({ tempo: "3-1-1", restSeconds: 90 });

  const tempoChip = chips[0];
  const restChip = chips[1];
  assert.equal(tempoChip.key, "tempo");
  assert.ok(tempoChip.ariaLabel.includes("Controlled"));
  assert.equal(restChip.key, "rest");
  assert.equal(restChip.ariaLabel, "90 seconds rest");
});

test("auto-expand is false when every advanced field is default", () => {
  // Arrange / Act / Assert
  assert.equal(shouldAutoExpand({ tempo: null, restSeconds: null }), false);
  assert.equal(shouldAutoExpand({ tempo: "", restSeconds: null }), false);
});

test("auto-expand is true when any advanced field is non-default", () => {
  assert.equal(shouldAutoExpand({ tempo: "3-1-1", restSeconds: null }), true);
  assert.equal(shouldAutoExpand({ tempo: null, restSeconds: 90 }), true);
  assert.equal(shouldAutoExpand({ tempo: null, restSeconds: 0 }), true);
  assert.equal(shouldAutoExpand({ setType: "warm_up" }), true);
});

test("auto-expand ignores a working/unset Set Type", () => {
  // A plain working set has nothing to reveal, so it opens collapsed.
  assert.equal(shouldAutoExpand({ setType: "working" }), false);
  assert.equal(shouldAutoExpand({ setType: null }), false);
});

test("undefined advanced fields are treated as the unset default", () => {
  // A surface may omit a field entirely rather than pass null.
  assert.deepEqual(prescriptionSummaryChips({}), []);
  assert.equal(shouldAutoExpand({}), false);
});

test("restSecondsFromInput reads a blank string as unset", () => {
  assert.equal(restSecondsFromInput(""), null);
  assert.equal(restSecondsFromInput("   "), null);
});

test("restSecondsFromInput reads a numeric string as its seconds count", () => {
  assert.equal(restSecondsFromInput("90"), 90);
});

test("restSecondsFromInput keeps a deliberate zero rest", () => {
  assert.equal(restSecondsFromInput("0"), 0);
});

test("restSecondsFromInput reads a non-numeric string as unset", () => {
  assert.equal(restSecondsFromInput("abc"), null);
});
