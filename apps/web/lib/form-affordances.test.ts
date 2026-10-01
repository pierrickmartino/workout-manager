import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { importComponent } from "./offline-tsx.ts";

// ADR-0093: autofill and the on-screen keyboard are the primitive's job. Asserted on the
// rendered markup rather than on the source, because what reaches the browser is the only
// thing a password manager or a phone keyboard reads.

function render(element: React.ReactElement): Document {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

test("every text primitive opts out of autofill by default", () => {
  // Arrange
  const { Input } = importComponent("components/ui/input.tsx");
  const { Select } = importComponent("components/ui/select.tsx");
  const { Textarea } = importComponent("components/ui/textarea.tsx");

  // Act
  const input = render(React.createElement(Input, {})).querySelector("input")!;
  const select = render(React.createElement(Select, {})).querySelector("select")!;
  const textarea = render(React.createElement(Textarea, {})).querySelector("textarea")!;

  // Assert — a workout number is not a saved address, and a browser offering to fill
  // one is the behaviour the default turns off.
  assert.equal(input.getAttribute("autocomplete"), "off");
  assert.equal(select.getAttribute("autocomplete"), "off");
  assert.equal(textarea.getAttribute("autocomplete"), "off");
});

test("a call site can still name the autofill token the field really carries", () => {
  // Arrange
  const { Input } = importComponent("components/ui/input.tsx");
  const { Textarea } = importComponent("components/ui/textarea.tsx");

  // Act
  const named = render(React.createElement(Input, { autoComplete: "name" }));
  const notes = render(React.createElement(Textarea, { autoComplete: "on" }));

  // Assert
  assert.equal(named.querySelector("input")!.getAttribute("autocomplete"), "name");
  assert.equal(notes.querySelector("textarea")!.getAttribute("autocomplete"), "on");
});

test("a number field asks for the keypad its step implies", () => {
  // Arrange
  const { Input } = importComponent("components/ui/input.tsx");

  // Act
  const reps = render(React.createElement(Input, { type: "number", min: 0 }));
  const weight = render(React.createElement(Input, { type: "number", step: "0.1" }));
  const distance = render(React.createElement(Input, { type: "number", step: "any" }));

  // Assert
  assert.equal(reps.querySelector("input")!.getAttribute("inputmode"), "numeric");
  assert.equal(weight.querySelector("input")!.getAttribute("inputmode"), "decimal");
  assert.equal(distance.querySelector("input")!.getAttribute("inputmode"), "decimal");
  // The step is still the browser's validation contract; deriving the keypad from it
  // must not consume it.
  assert.equal(weight.querySelector("input")!.getAttribute("step"), "0.1");
});

test("a text field keeps the platform keyboard unless its call site asks otherwise", () => {
  // Arrange
  const { Input } = importComponent("components/ui/input.tsx");

  // Act
  const free = render(React.createElement(Input, { placeholder: "70" }));
  const time = render(React.createElement(Input, { placeholder: "mm:ss", inputMode: "numeric" }));

  // Assert — an `mm:ss` time needs a colon the numeric pad does not carry, so the
  // derivation stays out of it and the call site decides.
  assert.equal(free.querySelector("input")!.getAttribute("inputmode"), null);
  assert.equal(time.querySelector("input")!.getAttribute("inputmode"), "numeric");
});

test("the profile fields a browser can genuinely fill carry their real tokens", () => {
  // Arrange
  const { ProfileForm } = importComponent("components/ProfileForm.tsx", {
    "@/app/profile/actions": { submitProfile: async () => ({ error: null }) },
  });

  // Act
  const form = render(React.createElement(ProfileForm, { submitLabel: "Save" }));

  // Assert — the display name is a person's name; the body measurements are not
  // anything a browser has on file, and say so.
  assert.equal(form.querySelector('[name="display_name"]')!.getAttribute("autocomplete"), "name");
  for (const name of ["age", "height_cm", "weight_kg", "default_rest_seconds"]) {
    assert.equal(form.querySelector(`[name="${name}"]`)!.getAttribute("autocomplete"), "off", name);
  }
  // And the measurements open a keypad: height and weight take fractions, age does not.
  assert.equal(form.querySelector('[name="age"]')!.getAttribute("inputmode"), "numeric");
  assert.equal(form.querySelector('[name="height_cm"]')!.getAttribute("inputmode"), "decimal");
  assert.equal(form.querySelector('[name="weight_kg"]')!.getAttribute("inputmode"), "decimal");
});
