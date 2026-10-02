import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { validateProfileForm } from "./profile-validation.ts";
import * as profileTypes from "./profile-types.ts";
import { loadTsx as loadComponent, loadTsxGraph } from "./tsx-harness.ts";

// ADR-0107: a field publishes its id and descriptions and the control claims them. Loaded as
// one graph, because `Field` and `Input` only agree if the context object they reach is the
// same one — which is the whole subject here.
function fieldParts(): {
  Field: any; FieldLabel: any; Input: any; Select: any; Textarea: any; useFieldControl: any;
} {
  const [field, control, input, select, textarea] = loadTsxGraph([
    "components/pulse/field.tsx",
    "components/pulse/field-control.tsx",
    "components/ui/input.tsx",
    "components/ui/select.tsx",
    "components/ui/textarea.tsx",
  ]);
  return {
    Field: field.Field, FieldLabel: field.FieldLabel, Input: input.Input,
    Select: select.Select, Textarea: textarea.Textarea,
    useFieldControl: control.useFieldControl,
  };
}

function control(markup: string): Element {
  return new JSDOM(markup).window.document.querySelector("input, select, textarea")!;
}

test("Field renders one explicit label and associates its hint without losing descriptions", () => {
  // Arrange
  const { Field, Input } = fieldParts();

  // Act
  const markup = renderToStaticMarkup(React.createElement(Field, {
    label: "Equipment", htmlFor: "equipment", hint: "Leave blank for bodyweight.",
    children: [React.createElement(Input, { key: "input", "aria-describedby": "existing" }),
      React.createElement("button", { key: "button", type: "button" }, "Preset")],
  }));

  // Assert
  assert.equal((markup.match(/<label\b/g) ?? []).length, 1);
  assert.match(markup, /<label[^>]*for="equipment"/);
  assert.match(markup, /aria-describedby="existing equipment-hint"/);
  assert.match(markup, /id="equipment-hint"/);
  // An auxiliary button beside the control claims none of the wiring.
  assert.doesNotMatch(markup, /<button[^>]*aria-describedby/);
  assert.doesNotMatch(markup, /<button[^>]*id="equipment"/);
});

test("a field's control is wired wherever it sits, not because it came first", () => {
  // Arrange — the three shapes that silently broke the positional contract: the control
  // wrapped in a layout div, placed after another child, and preceded by a conditional that
  // rendered nothing. Each one used to move the id onto the wrong element, or onto no element.
  const { Field, Input } = fieldParts();
  const shapes = {
    wrapped: React.createElement("div", { className: "flex" }, React.createElement(Input, {})),
    second: [React.createElement("p", { key: "p" }, "Read this first"),
      React.createElement(Input, { key: "input" })],
    conditional: [false, React.createElement(Input, { key: "input" })],
  };

  for (const [shape, children] of Object.entries(shapes)) {
    // Act
    const markup = renderToStaticMarkup(React.createElement(Field, {
      label: "Load", htmlFor: `load-${shape}`, hint: "Kilograms.", children,
    }));

    // Assert — the label points at the control, and the hint describes it.
    const field = control(markup);
    assert.equal(field.getAttribute("id"), `load-${shape}`, shape);
    assert.equal(field.getAttribute("aria-describedby"), `load-${shape}-hint`, shape);
    assert.match(markup, new RegExp(`<label[^>]*for="load-${shape}"`), shape);
  }
});

test("a field with no named id generates one and both ends use it", () => {
  // Arrange — `htmlFor` is how a call site picks the id; without one the field makes it, and
  // the label and the control still have to agree.
  const { Field, Input } = fieldParts();

  // Act
  const markup = renderToStaticMarkup(React.createElement(Field, {
    label: "Objective", children: React.createElement(Input, {}),
  }));

  // Assert
  const id = control(markup).getAttribute("id");
  assert.ok(id, "the control took no id");
  assert.match(markup, new RegExp(`<label[^>]*for="${id}"`));
});

test("an error marks the control invalid and is described through that same control", () => {
  // Arrange
  const { Field, Input } = fieldParts();

  // Act
  const markup = renderToStaticMarkup(React.createElement(Field, {
    label: "Age", htmlFor: "age", error: "Enter a whole age.", hint: "Years.",
    children: React.createElement(Input, { type: "number" }),
  }));

  // Assert — hint before error, as the two spans render, so a reader hears them in the
  // order they appear.
  const field = control(markup);
  assert.equal(field.getAttribute("aria-invalid"), "true");
  assert.equal(field.getAttribute("aria-describedby"), "age-hint age-error");
  assert.match(markup, /id="age-error"[^>]*>Enter a whole age\./);
});

test("every primitive claims the wiring, not only the text input", () => {
  // Arrange — a picker and a free-text area are labelled the same way, and `Select` wraps
  // its control in a positioning div, so this is the wrapped case from the inside too.
  const { Field, Input, Select, Textarea } = fieldParts();

  for (const [name, Primitive] of Object.entries({ Input, Select, Textarea })) {
    // Act
    const markup = renderToStaticMarkup(React.createElement(Field, {
      label: name, htmlFor: "picked", error: "Pick one.",
      children: React.createElement(Primitive, {}),
    }));

    // Assert
    const field = control(markup);
    assert.equal(field.getAttribute("id"), "picked", name);
    assert.equal(field.getAttribute("aria-describedby"), "picked-error", name);
    assert.equal(field.getAttribute("aria-invalid"), "true", name);
  }
});

test("a primitive outside any field is untouched by the wiring", () => {
  // Arrange — the hook answers "nothing" outside a provider rather than throwing, because
  // most of these controls render outside a `Field`: a search box, a filter, a row cell.
  const { Input } = fieldParts();

  // Act
  const markup = renderToStaticMarkup(React.createElement(Input, { name: "query", type: "search" }));

  // Assert
  const field = control(markup);
  assert.equal(field.getAttribute("id"), null);
  assert.equal(field.getAttribute("aria-describedby"), null);
  assert.equal(field.getAttribute("aria-invalid"), null);
});

test("a control that is not a primitive claims the wiring by spreading the hook", () => {
  // Arrange — the escape hatch, and the shape `AdminExerciseImage`'s file picker uses: not
  // one of the three primitives, so it says so at the call site.
  const { Field, useFieldControl } = fieldParts();
  function FilePicker(): React.JSX.Element {
    return React.createElement("input", { type: "file", ...useFieldControl() });
  }

  // Act
  const markup = renderToStaticMarkup(React.createElement(Field, {
    label: "Choose image", htmlFor: "exercise-image", hint: "2 MB max.",
    children: React.createElement(FilePicker),
  }));

  // Assert
  const picker = control(markup);
  assert.equal(picker.getAttribute("id"), "exercise-image");
  assert.equal(picker.getAttribute("aria-describedby"), "exercise-image-hint");
});

test("the compact FieldLabel provides a single explicit label and wires its control", () => {
  // Arrange — it renders a `Field`, so the claim has to reach through it.
  const { FieldLabel, Input } = fieldParts();

  // Act
  const markup = renderToStaticMarkup(React.createElement(FieldLabel, {
    label: "Sets", children: React.createElement(Input, { type: "number" }),
  }));

  // Assert
  const id = control(markup).getAttribute("id");
  assert.ok(id, "the control took no id");
  assert.equal((markup.match(/<label\b/g) ?? []).length, 1);
  assert.match(markup, new RegExp(`<label[^>]*for="${id}"`));
});

test("failed profile submissions identify fields, announce errors, and focus on each failure", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
    FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let serverFailure = false;
  let transportFailure = false;
  const { ProfileForm } = loadComponent("components/ProfileForm.tsx", {
    "@/app/profile/actions": { submitProfile: async (_previous: unknown, form: FormData) => {
      if (transportFailure) throw new Error("offline");
      const fieldErrors = validateProfileForm(form);
      return serverFailure ? { error: "Could not save your profile." }
        : { error: "Correct the highlighted fields.", fieldErrors };
    } },
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    await React.act(async () => root.render(React.createElement(ProfileForm, { submitLabel: "Save" })));
    const form = document.querySelector("form")!;
    const age = form.querySelector<HTMLInputElement>('[name="age"]')!;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]), select, textarea')) {
      assert.equal(control.labels?.length, 1, control.name);
      assert.ok(control.id, control.name);
      assert.equal(control.labels![0].htmlFor, control.id, control.name);
    }
    age.value = "151";
    for (let attempt = 0; attempt < 2; attempt++) {
      submit.focus();
      await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
      assert.equal(age.getAttribute("aria-invalid"), "true");
      assert.equal(age.value, "151", "failed submission retains the user's input");
      assert.equal(document.activeElement, age);
      const errorId = age.getAttribute("aria-describedby")!.split(" ").at(-1)!;
      assert.match(document.getElementById(errorId)!.textContent!, /whole age/);
      assert.match(form.querySelector('[role="alert"]')!.textContent!, /Correct/);
    }
    serverFailure = true;
    age.value = "30";
    submit.focus();
    await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, form.querySelector('[role="alert"]'));
    assert.notEqual(age.getAttribute("aria-invalid"), "true");
    transportFailure = true;
    submit.focus();
    await React.act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, form.querySelector('[role="alert"]'));
    assert.match(document.activeElement!.textContent!, /try again/);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "FormData", "IS_REACT_ACT_ENVIRONMENT"]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("Alert announces dynamic results while static messages stay quiet", () => {
  const { Alert } = loadComponent("components/pulse/alert.tsx");
  for (const [tone, role] of [["error", "alert"], ["success", "status"], ["info", "status"]]) {
    assert.match(renderToStaticMarkup(React.createElement(Alert, { tone, announce: true }, "Message")), new RegExp(`role="${role}"`));
  }
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Alert, { tone: "error" }, "Static message")), /role="(?:alert|status)"/);
  assert.match(renderToStaticMarkup(React.createElement(Alert, { tone: "error", role: "status" }, "Message")), /role="status"/);
});

test("profile action targets validation failures and returns announced failures for rejected saves", async () => {
  let failure: "validation" | "network" | "api" = "validation";
  const { submitProfile } = loadComponent("app/profile/actions.ts", {
    "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
    "@/lib/profile-validation": { validateProfileForm },
    "@/lib/back-target": { sanitizeInternalPath: () => null },
    "@/lib/profile": { ...profileTypes, saveProfile: async () => {
      assert.notEqual(failure, "validation", "invalid values must never be saved");
      if (failure === "network") throw new Error("offline");
      return { success: false, error: "Save rejected." };
    } },
  });
  const form = new FormData();
  form.set("age", "151");
  const invalid = await submitProfile({ error: null }, form);
  assert.match(invalid.fieldErrors.age, /whole age/);
  assert.ok(invalid.error);
  form.set("age", "30");
  failure = "network";
  assert.match((await submitProfile(invalid, form)).error, /try again/);
  failure = "api";
  assert.deepEqual(await submitProfile(invalid, form), { error: "Save rejected." });
});

test("a grouped distance/time field uses a legend rather than labeling its layout div", () => {
  const { FieldLabel } = loadComponent("components/pulse/field.tsx");
  const markup = renderToStaticMarkup(React.createElement(FieldLabel, {
    label: "Set 1 distance (km)", group: true,
    children: React.createElement("div", {},
      React.createElement("input", { "aria-label": "Set 1 distance" }),
      React.createElement("input", { "aria-label": "Set 1 time" })),
  }));
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelector("fieldset > legend")?.textContent, "Set 1 distance (km)");
  assert.equal(document.querySelector("label"), null);
  assert.equal(document.querySelectorAll("input[aria-label]").length, 2);
});

test("metric save results and deletion failures have announcement semantics", () => {
  const boundaries = {
    react: { ...React, useActionState: () => [{ error: "Save failed.", saved: true }, () => {}, false] },
    "@/app/metrics/actions": { submitMetric: () => {} },
    "@/app/history/actions": { deleteLogAction: () => {} },
  };
  const { RecordMetricForm } = loadComponent("components/RecordMetricForm.tsx", boundaries);
  const metrics = new JSDOM(renderToStaticMarkup(React.createElement(RecordMetricForm, {
    today: "2026-09-26", defaultMetric: "weight",
  }))).window.document;
  assert.equal(metrics.querySelector('[role="alert"]')?.textContent, "Save failed.");
  assert.equal(metrics.querySelector('[role="status"]')?.textContent, "Reading saved.");
  const { DeleteLogControl } = loadComponent("components/DeleteLogControl.tsx", boundaries);
  const deletion = new JSDOM(renderToStaticMarkup(React.createElement(DeleteLogControl, {
    logId: 1, disabled: false, reason: null,
  }))).window.document;
  assert.equal(deletion.querySelector('[role="alert"]')?.textContent.trim(), "Save failed.");
});


test("dirty forms guard client departures and browser exits, while cancel keeps editing", async () => {
  const dom = new JSDOM("<main id='root'></main><nav><button>Other control</button></nav>", { url: "http://localhost/sessions/new" });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const destinations: string[] = [];
  const router = { push: (href: string) => destinations.push(href) };
  const { NavigationGuardProvider, useNavigationGuard } = loadComponent("components/NavigationGuardProvider.tsx", {
    "next/navigation": { useRouter: () => router },
  });
  function Form({ dirty }: { dirty: boolean }) {
    useNavigationGuard(dirty);
    return React.createElement("a", { href: "/history" }, "History");
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const render = (dirty: boolean) => root.render(React.createElement(NavigationGuardProvider, null, React.createElement(Form, { dirty })));
  const unload = () => {
    const event = new dom.window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    await React.act(async () => render(true));
    assert.equal(unload(), true);
    const link = document.querySelector("a")!;
    link.focus();
    await React.act(async () => link.click());
    assert.equal(destinations.length, 0);
    assert.ok(document.querySelector('[role="dialog"]'));
    const cancel = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Keep editing")!;
    await React.act(async () => cancel.click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, link);
    assert.equal(unload(), true);
    await React.act(async () => link.click());
    const confirm = Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Discard")!;
    await React.act(async () => confirm.click());
    assert.deepEqual(destinations, ["/history"]);
    assert.equal(unload(), false);
    await React.act(async () => render(false));
    assert.equal(unload(), false);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
