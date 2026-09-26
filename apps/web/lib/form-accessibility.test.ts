import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { validateProfileForm } from "./profile-validation.ts";
import * as profileTypes from "./profile-types.ts";

// Render real TSX with the existing offline Node runner, without a browser or build.
const require = createRequire(import.meta.url);
function loadComponent(path: string, boundaries: Record<string, unknown> = {}): any {
  const filename = resolve(import.meta.dirname, "..", path);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): any => {
    if (name in boundaries) return boundaries[name];
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    const extension = existsSync(resolve(import.meta.dirname, "..", `${base}.ts`)) ? ".ts" : ".tsx";
    return loadComponent(`${base}${extension}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

test("Field renders one explicit label and associates its hint without losing descriptions", () => {
  const { Field } = loadComponent("components/pulse/field.tsx");
  const markup = renderToStaticMarkup(React.createElement(Field, {
    label: "Equipment", hint: "Leave blank for bodyweight.",
    children: [React.createElement("input", { key: "input", id: "equipment", "aria-describedby": "existing" }),
      React.createElement("button", { key: "button", type: "button" }, "Preset")],
  }));
  assert.equal((markup.match(/<label\b/g) ?? []).length, 1);
  assert.match(markup, /<label[^>]*for="equipment"/);
  assert.match(markup, /aria-describedby="existing equipment-hint"/);
  assert.match(markup, /id="equipment-hint"/);
  assert.doesNotMatch(markup, /<button[^>]*aria-describedby/);
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

test("Alert announces errors assertively and confirmations politely, with an explicit override", () => {
  const { Alert } = loadComponent("components/pulse/alert.tsx");
  for (const [tone, role] of [["error", "alert"], ["success", "status"], ["info", "status"]]) {
    assert.match(renderToStaticMarkup(React.createElement(Alert, { tone }, "Message")), new RegExp(`role="${role}"`));
  }
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

test("compact FieldLabel also provides a single explicit label", () => {
  const { FieldLabel } = loadComponent("components/pulse/field.tsx");
  const markup = renderToStaticMarkup(React.createElement(FieldLabel, {
    label: "Load", children: React.createElement("input", { id: "load" }),
  }));
  assert.equal((markup.match(/<label\b/g) ?? []).length, 1);
  assert.match(markup, /<label[^>]*for="load"/);
});
