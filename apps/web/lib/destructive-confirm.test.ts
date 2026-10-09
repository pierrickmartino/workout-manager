import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue, type ModuleBoundaries } from "./tsx-harness.ts";

// #8: three irreversible actions asked for confirmation with `window.confirm`, a browser
// dialog that ignores the Skin, cannot be styled or focus-managed, and — the part that makes
// it a correctness problem rather than a cosmetic one — can be switched off for the rest of
// the page by the browser's own "prevent additional dialogs" checkbox, after which the guard
// returns false and the control silently stops working, or true and it stops guarding.
//
// `components/pulse/confirm-dialog.tsx` is the app's real answer: themed, focus-trapped,
// Escape-closable, restoring focus to the opener and `inert`-ing the background. These tests
// mount each of the three controls and hold the same three properties: opening the dialog
// performs nothing, cancelling performs nothing, and only confirming acts.

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function dialogButton(label: string): HTMLButtonElement {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')];
  const match = buttons.find((button) => button.textContent === label);
  assert.ok(match, `no "${label}" in the dialog: ${buttons.map((b) => b.textContent).join(", ")}`);
  return match;
}

function buttonLabelled(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent === label,
  );
  assert.ok(match, `no "${label}" button on screen`);
  return match;
}

async function mount<P extends object>(
  path: string,
  boundaries: ModuleBoundaries,
  props: P,
): Promise<{ unmount: () => void }> {
  const module = loadTsx<Record<string, (props: P) => React.JSX.Element>>(path, boundaries);
  const component = Object.values(module)[0];
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  await React.act(async () => root.render(React.createElement(component, props)));
  return { unmount: () => root.unmount() };
}

// A control that never calls `window.confirm` is the point, so the harness makes calling it
// an error rather than letting a forgotten call quietly return undefined (falsy) and look
// like a cancel.
function forbidNativeConfirm(): void {
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: () => {
      throw new Error("window.confirm was called; the themed ConfirmDialog is the app's confirm");
    },
  });
}

test("deleting a logged session asks in the themed dialog, and only a confirm deletes", async () => {
  // Arrange
  const { restore } = mountDom({ url: "http://localhost/history" });
  try {
    forbidNativeConfirm();
    const deleted: number[] = [];
    const { unmount } = await mount(
      "components/DeleteLogControl.tsx",
      {
        "@/app/history/actions": {
          deleteLogAction: async (_state: unknown, form: FormData) => {
            deleted.push(Number(form.get("log_id")));
            return { error: null };
          },
        },
      },
      { logId: 42, disabled: false, reason: null },
    );

    // Act — open
    await React.act(async () => buttonLabelled("Delete").click());

    // Assert — the question is asked in the app's own dialog, and nothing has happened yet.
    assert.ok(dialog(), "no themed dialog opened");
    assert.deepEqual(deleted, []);

    // Act — cancel
    await React.act(async () => dialogButton("Cancel").click());

    // Assert — a cancel is a cancel: the record is untouched and the control is back.
    assert.equal(dialog(), null);
    assert.deepEqual(deleted, []);

    // Act — confirm
    await React.act(async () => buttonLabelled("Delete").click());
    await React.act(async () => dialogButton("Delete").click());

    // Assert
    assert.deepEqual(deleted, [42]);
    assert.equal(dialog(), null);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("the delete prompt is typeset, not typed", async () => {
  // Arrange — `window.confirm` renders plain text, which is why its copy carried a straight
  // apostrophe. The dialog is the app's own typography (audit #8, #11).
  const { restore } = mountDom({ url: "http://localhost/history" });
  try {
    forbidNativeConfirm();
    const { unmount } = await mount(
      "components/DeleteLogControl.tsx",
      { "@/app/history/actions": { deleteLogAction: async () => ({ error: null }) } },
      { logId: 1, disabled: false, reason: null },
    );

    // Act
    await React.act(async () => buttonLabelled("Delete").click());

    // Assert
    const text = dialog()!.textContent ?? "";
    assert.match(text, /can’t be undone/);
    assert.doesNotMatch(text, /can't/);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("a blocked logged-session delete offers no dialog at all", async () => {
  // Arrange — the contiguity gate (ADR-0034) disables the control; a disabled button that
  // still opened a confirm would be asking about something it cannot do.
  const { restore } = mountDom({ url: "http://localhost/history" });
  try {
    forbidNativeConfirm();
    const { unmount } = await mount(
      "components/DeleteLogControl.tsx",
      { "@/app/history/actions": { deleteLogAction: async () => ({ error: null }) } },
      { logId: 1, disabled: true, reason: "Delete the most recent session first." },
    );

    // Act
    await React.act(async () => buttonLabelled("Delete").click());

    // Assert
    assert.equal(dialog(), null);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("the admin hard delete asks in the themed dialog, and only a confirm deletes", async () => {
  // Arrange — retired and unreferenced, so the guarded delete is offered (ADR-0076).
  const { restore } = mountDom({ url: "http://localhost/admin/exercises/7" });
  try {
    forbidNativeConfirm();
    const deleted: number[] = [];
    const { unmount } = await mount(
      "components/AdminExerciseDelete.tsx",
      {
        "@/app/admin/exercises/actions": {
          deleteExerciseAction: async (id: number) => {
            deleted.push(id);
            return { deleted: true, error: null };
          },
        },
        "next/navigation": { useRouter: () => ({ push: () => {}, refresh: () => {} }) },
      },
      { exercise: { id: 7, name: "Back Squat", retired: true, reference_count: 0 } },
    );

    // Act — open, then cancel
    await React.act(async () => buttonLabelled("Delete permanently").click());
    assert.ok(dialog(), "no themed dialog opened");
    await React.act(async () => dialogButton("Cancel").click());

    // Assert
    assert.equal(dialog(), null);
    assert.deepEqual(deleted, []);

    // Act — open, then confirm
    await React.act(async () => buttonLabelled("Delete permanently").click());
    await React.act(async () => dialogButton("Delete permanently").click());

    // Assert
    assert.deepEqual(deleted, [7]);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("superseding the current protocol asks in the themed dialog before generating", async () => {
  // Arrange — the one-way door (ADR-0037): generating sets the in-progress Protocol aside.
  const { restore } = mountDom({ url: "http://localhost/protocols/new" });
  try {
    forbidNativeConfirm();
    const started: unknown[] = [];
    const { unmount } = await mount(
      "components/GenerateProtocolForm.tsx",
      {
        "@/lib/use-protocol-generation": {
          useProtocolGeneration: () => ({
            phase: "idle",
            error: null,
            start: async (input: unknown) => {
              started.push(input);
            },
          }),
        },
        "@/lib/use-connectivity": { useConnectivity: () => true },
      },
      { supersedeWarning: "You're partway through “Week 3”.", defaultEquipment: [] },
    );

    // Act — submitting opens the door's question rather than walking through it.
    const form = document.querySelector("form")!;
    await React.act(async () =>
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    );

    // Assert
    assert.ok(dialog(), "no themed dialog opened");
    assert.match(dialog()!.textContent ?? "", /partway through/);
    assert.deepEqual(started, []);

    // Act — backing out
    await React.act(async () => dialogButton("Keep current").click());

    // Assert — nothing generated, and the form is still there to edit.
    assert.equal(dialog(), null);
    assert.deepEqual(started, []);
    assert.ok(document.querySelector("form"));

    // Act — going through with it, having first typed an objective of their own, so what
    // arrives is the filled-in form and not the defaults it was mounted with.
    const objective = document.querySelector<HTMLInputElement>('input[name="objective"]')!;
    await React.act(async () => setFieldValue(objective, "build a bigger squat"));
    await React.act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    );
    await React.act(async () => dialogButton("Generate anyway").click());

    // Assert — the values held across the dialog are the submitted ones. Re-reading the form
    // on confirm would be the same assertion; holding a stale or empty payload would not.
    assert.equal(started.length, 1);
    assert.equal((started[0] as { objective: string }).objective, "build a bigger squat");

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("generating with nothing to supersede asks nothing", async () => {
  // Arrange — a silent supersede (no settled progress to lose) must not grow a dialog.
  const { restore } = mountDom({ url: "http://localhost/protocols/new" });
  try {
    forbidNativeConfirm();
    const started: unknown[] = [];
    const { unmount } = await mount(
      "components/GenerateProtocolForm.tsx",
      {
        "@/lib/use-protocol-generation": {
          useProtocolGeneration: () => ({
            phase: "idle",
            error: null,
            start: async (input: unknown) => {
              started.push(input);
            },
          }),
        },
        "@/lib/use-connectivity": { useConnectivity: () => true },
      },
      { supersedeWarning: null, defaultEquipment: [] },
    );

    // Act
    await React.act(async () =>
      document
        .querySelector("form")!
        .dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })),
    );

    // Assert
    assert.equal(dialog(), null);
    assert.equal(started.length, 1);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("deleting an un-started protocol asks in the themed dialog, and only a confirm deletes", async () => {
  // Arrange — the server marked it deletable and no Live Session holds it (issue #639).
  const { restore } = mountDom({ url: "http://localhost/protocols" });
  try {
    forbidNativeConfirm();
    const deleted: number[] = [];
    const { unmount } = await mount(
      "components/DeleteProtocolControl.tsx",
      {
        "@/app/protocols/actions": {
          deleteProtocolAction: async (_state: unknown, form: FormData) => {
            deleted.push(Number(form.get("protocol_id")));
            return { error: null };
          },
        },
      },
      { action: { kind: "available", protocolId: 5 }, protocolTitle: "Summer block" },
    );

    // Act — open
    await React.act(async () => buttonLabelled("Delete").click());

    // Assert — the question names the Protocol, and nothing has happened yet.
    assert.ok(dialog(), "no themed dialog opened");
    assert.match(dialog()!.textContent ?? "", /Summer block/);
    assert.deepEqual(deleted, []);

    // Act — cancel
    await React.act(async () => dialogButton("Cancel").click());

    // Assert
    assert.equal(dialog(), null);
    assert.deepEqual(deleted, []);

    // Act — confirm
    await React.act(async () => buttonLabelled("Delete").click());
    await React.act(async () => dialogButton("Delete").click());

    // Assert
    assert.deepEqual(deleted, [5]);
    assert.equal(dialog(), null);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});

test("a protocol delete blocked by its live session announces why and offers no dialog", async () => {
  // Arrange — the Live Session in progress is one of this Protocol's Sessions.
  const { restore } = mountDom({ url: "http://localhost/protocols" });
  try {
    forbidNativeConfirm();
    const reason = "Your live session is from this protocol. Finish or resume it before you delete it.";
    const { unmount } = await mount(
      "components/DeleteProtocolControl.tsx",
      {
        "@/app/protocols/actions": { deleteProtocolAction: async () => ({ error: null }) },
        "next/link": {
          __esModule: true,
          default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
        },
      },
      {
        action: { kind: "blocked", reason, resumeHref: "/sessions/21/live" },
        protocolTitle: "Summer block",
      },
    );

    // Act
    const button = buttonLabelled("Delete");
    await React.act(async () => button.click());

    // Assert — still focusable, announced unavailable, with the reason attached, and inert.
    assert.equal(dialog(), null);
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute("aria-disabled"), "true");
    const described = document.getElementById(button.getAttribute("aria-describedby")!);
    assert.equal(described?.textContent, reason);

    await React.act(async () => unmount());
  } finally {
    restore();
  }
});
