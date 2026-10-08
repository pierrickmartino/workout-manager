import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { loadTsx } from "./tsx-harness.ts";
import { loadKindOptions, loadValueHint, loadValueInputMode } from "./load.ts";
import type { WeightUnit } from "./weight-unit.ts";

// The Load value field says what it is in and what an empty value means, whichever kind is
// picked (ADR-0114). The plan-side field used to show `60 kg` for all five kinds — a "kg" for a
// percentage, a number for a descriptive Load, and a unit the decimal keypad cannot type — so
// these tests render the shared field and the Prescription stack that hosts it, for every kind
// the picker offers.

function documentOf(markup: string): Document {
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

function renderLoadValueInput(kind: string, unit: WeightUnit): Document {
  const { LoadValueInput } = loadTsx("components/pulse/load-value-input.tsx");
  return documentOf(renderToStaticMarkup(React.createElement(LoadValueInput, {
    kind,
    unit,
    value: "",
    onChange: () => {},
    "aria-label": "Load for Back Squat",
  })));
}

function suffixOf(document: Document): string {
  return document.querySelector("[aria-hidden]")?.textContent ?? "";
}

for (const unit of ["kg", "lb"] as const) {
  for (const { value: kind } of loadKindOptions(unit)) {
    test(`the Load value field shows the ${kind} hint in ${unit}`, () => {
      // Arrange
      const expected = loadValueHint(kind, unit);

      // Act
      const document = renderLoadValueInput(kind, unit);
      const input = document.querySelector("input");

      // Assert
      assert.equal(input?.getAttribute("placeholder"), expected.placeholder);
      assert.equal(suffixOf(document), expected.suffix);
      assert.equal(input?.getAttribute("inputmode") ?? undefined, loadValueInputMode(kind));
      assert.equal(input?.getAttribute("spellcheck"), "false");
    });
  }
}

test("a suffixed field reserves room so a typed value never runs under the unit", () => {
  // Arrange / Act
  const suffixed = renderLoadValueInput("absolute", "kg").querySelector("input");
  const bare = renderLoadValueInput("qualitative", "kg").querySelector("input");

  // Assert — a descriptive Load has no suffix, so its text keeps the full width.
  assert.match(suffixed?.className ?? "", /\bpr-/);
  assert.doesNotMatch(bare?.className ?? "", /\bpr-/);
});

test("the unit suffix is hidden from assistive tech — the kind picker already names it", () => {
  // Arrange / Act
  const document = renderLoadValueInput("bodyweight", "kg");

  // Assert
  assert.equal(suffixOf(document), "+kg");
  assert.equal(document.querySelector("[aria-hidden]")?.getAttribute("aria-hidden"), "true");
});

function renderPrescriptionLoad(loadKind: string): Document {
  const { PrescriptionFieldStack } = loadTsx(
    "components/prescription/PrescriptionFieldStack.tsx",
  );
  const noop = (): void => {};
  return documentOf(renderToStaticMarkup(React.createElement(PrescriptionFieldStack, {
    exerciseName: "Back Squat",
    weightUnit: "kg",
    kind: "repetitions",
    unit: "km",
    sets: "3",
    target: "8-12",
    restSeconds: "",
    tempo: "",
    setType: "",
    loadKind,
    loadValue: "",
    showRest: true,
    onChangeKind: noop,
    onChangeUnit: noop,
    onChangeSets: noop,
    onChangeTarget: noop,
    onChangeRest: noop,
    onChangeTempo: noop,
    onChangeSetType: noop,
    onChangeLoadKind: noop,
    onChangeLoadValue: noop,
  })));
}

for (const { value: kind } of loadKindOptions("kg")) {
  test(`the Prescription Load field follows the picked ${kind} kind`, () => {
    // Arrange
    const expected = loadValueHint(kind, "kg");

    // Act
    const input = renderPrescriptionLoad(kind)
      .querySelector('input[aria-label="Load for Back Squat"]');

    // Assert
    assert.equal(input?.getAttribute("placeholder"), expected.placeholder);
    assert.equal(input?.parentElement?.querySelector("[aria-hidden]")?.textContent ?? "",
      expected.suffix);
  });
}
