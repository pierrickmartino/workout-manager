import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, loadTsxGraph, mountDom, type ModuleBoundaries } from "./tsx-harness.ts";

// The action sheet (ADR-0113) replaced the `⋯ More` / `⋯ Actions` <details> disclosure. A
// sheet is a modal, and a modal brings obligations a disclosure never had: it must be
// reachable and leavable by keyboard, it must hand focus back, it must not let a gesture
// inside it reach the page beneath, and it must not outlive the thing it acts on. Each test
// here holds one of those against a real mount, because none of them is visible in the
// source's shape.

const SHEET = "components/pulse/action-sheet.tsx";

// Every assertion about an element compares to a boolean. A failing `assert.equal(element, …)`
// hands the live JSDOM node to the reporter, which serializes it — the whole window graph — and
// never finishes: the file hangs instead of saying which assertion failed.
function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function trigger(name: string): HTMLButtonElement {
  const match = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  assert.ok(match, `no trigger named "${name}"`);
  return match;
}

function buttonWithText(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes(text),
  );
  assert.ok(match, `no button reading "${text}"`);
  return match;
}

type Render = (element: React.ReactElement) => Promise<void>;

// A fresh DOM per test, torn down in the order that keeps a failure contained: React unmounts
// first — taking an open sheet's listeners, `inert` marks and scroll lock with it — and only then
// is the window closed. The other order leaves a mounted modal holding a dead document, and the
// next test fails for a reason that has nothing to do with its subject.
async function inDom(body: (render: Render) => Promise<void>, url?: string): Promise<void> {
  const { restore } = mountDom({ url });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    await body(async (element) => React.act(async () => root.render(element)));
  } finally {
    await React.act(async () => root.unmount());
    restore();
  }
}

function press(key: string): void {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

test("a closed sheet is one icon trigger and renders none of its actions", async () => {
  // Arrange
  await inDom(async (render) => {
    const { ActionSheet } = loadTsx(SHEET);

    // Act
    await render(
      React.createElement(ActionSheet, { label: "Session actions", title: "Session actions" },
        React.createElement("button", { type: "button" }, "Rename")),
    );

    // Assert
    const opener = trigger("Session actions");
    assert.equal(opener.getAttribute("aria-haspopup"), "dialog");
    assert.equal(opener.getAttribute("aria-expanded"), "false");
    assert.equal(opener.textContent, "", "the trigger is icon-only; its name is the label");
    assert.ok(dialog() === null, "a closed sheet rendered a dialog");
    assert.equal(document.body.textContent?.includes("Rename"), false);
  });
});

test("opening raises a labelled modal holding the actions, with focus inside it", async () => {
  // Arrange
  await inDom(async (render) => {
    const { ActionSheet } = loadTsx(SHEET);
    await render(
      React.createElement(ActionSheet, { label: "Actions for Push A", title: "Push A" },
        React.createElement("button", { type: "button" }, "Rename")),
    );

    // Act
    await React.act(async () => trigger("Actions for Push A").click());

    // Assert
    const sheet = dialog();
    assert.ok(sheet, "no dialog opened");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    const heading = document.getElementById(sheet.getAttribute("aria-labelledby") ?? "");
    assert.equal(heading?.textContent, "Push A", "the dialog is named by its visible title");
    assert.equal(trigger("Actions for Push A").getAttribute("aria-expanded"), "true");
    assert.ok(sheet.textContent?.includes("Rename"));
    assert.ok(sheet.contains(document.activeElement), "focus did not move into the sheet");
  });
});

test("Escape, the close button and the backdrop each dismiss it and return focus to the trigger", async () => {
  // Arrange
  await inDom(async (render) => {
    const { ActionSheet } = loadTsx(SHEET);
    await render(
      React.createElement(ActionSheet, { label: "Session actions", title: "Session actions" },
        React.createElement("button", { type: "button" }, "Rename")),
    );
    const opener = trigger("Session actions");
    const dismissals: ReadonlyArray<[string, () => void]> = [
      ["Escape", () => press("Escape")],
      ["close button", () => trigger("Close").click()],
      ["backdrop", () => dialog()!.parentElement!.click()],
    ];

    for (const [how, dismiss] of dismissals) {
      opener.focus();
      await React.act(async () => opener.click());
      assert.ok(dialog(), `sheet did not open before the ${how} case`);

      // Act
      await React.act(async () => dismiss());

      // Assert
      assert.ok(dialog() === null, `${how} did not close the sheet`);
      assert.ok(document.activeElement === opener, `${how} did not return focus to the trigger`);
    }
  });
});

test("a tap on the sheet itself, or on an action, does not dismiss it", async () => {
  // Arrange
  await inDom(async (render) => {
    const { ActionSheet } = loadTsx(SHEET);
    await render(
      React.createElement(ActionSheet, { label: "Session actions", title: "Session actions" },
        React.createElement("button", { type: "button" }, "Rename")),
    );
    await React.act(async () => trigger("Session actions").click());

    // Act
    await React.act(async () => dialog()!.click());
    await React.act(async () => buttonWithText("Rename").click());

    // Assert — an action that opens an inline editor (Rename, Share, a two-step Delete) needs
    // the sheet to stay up; only the action decides when it is finished.
    assert.ok(dialog(), "a tap inside the sheet closed it");
  });
});

test("a press inside the sheet never reaches a gesture handler on the page beneath it", async () => {
  // Arrange — a My Sessions row wraps its card, menu included, in a press-and-hold Favorite
  // shortcut. Without a boundary, holding a finger on any action in the sheet would arm it.
  await inDom(async (render) => {
    const { ActionSheet } = loadTsx(SHEET);
    const reached: string[] = [];
    const record = (event: React.SyntheticEvent) => reached.push(event.type);
    await render(
      React.createElement("div", {
        onPointerDown: record, onPointerUp: record, onPointerMove: record, onClickCapture: record,
      }, React.createElement(ActionSheet, { label: "Session actions", title: "Session actions" },
        React.createElement("button", { type: "button" }, "Rename"))),
    );
    await React.act(async () => trigger("Session actions").click());
    reached.length = 0;

    // Act
    const action = buttonWithText("Rename");
    for (const type of ["pointerdown", "pointermove", "pointerup"]) {
      await React.act(async () => {
        action.dispatchEvent(new window.Event(type, { bubbles: true }));
      });
    }

    // Assert
    assert.deepEqual(
      reached.filter((type) => type.startsWith("pointer")),
      [],
      "a pointer event escaped the sheet",
    );
  });
});

test("an action can close the sheet it sits in, and reads no sheet outside one", async () => {
  // Arrange
  await inDom(async (render) => {
    const { ActionSheet, useActionSheet } = loadTsx(SHEET);
    let outside: unknown = "unread";
    function Outside() {
      outside = useActionSheet();
      return null;
    }
    function Finish() {
      const sheet = useActionSheet();
      return React.createElement("button", { type: "button", onClick: () => sheet?.actions.close() }, "Finish");
    }
    await render(
      React.createElement(React.Fragment, null,
        React.createElement(Outside),
        React.createElement(ActionSheet, { label: "Session actions", title: "Session actions" },
          React.createElement(Finish))),
    );
    await React.act(async () => trigger("Session actions").click());

    // Act
    await React.act(async () => buttonWithText("Finish").click());

    // Assert
    assert.ok(dialog() === null, "the action could not close its sheet");
    assert.equal(outside, null, "a component outside any sheet read one");
  });
});

test("removing an exercise closes its sheet, because the card it sits on now shows the next one", async () => {
  // Arrange — PrescriptionCard is keyed by position and the survivors re-number in place, so
  // after a Remove the very same card renders a different movement. A sheet left open would
  // be offering to remove an exercise the reader never chose.
  await inDom(async (render) => {
    const removed: number[] = [];
    const boundaries: ModuleBoundaries = {
      "@/app/sessions/[id]/actions": {
        submitRemovePrescription: async (_sessionId: number, position: number) => {
          removed.push(position);
          return { error: null };
        },
      },
    };
    const [{ ActionSheet }, { RemoveExerciseButton }] = loadTsxGraph(
      [SHEET, "components/RemoveExerciseButton.tsx"],
      boundaries,
    );
    await render(
      React.createElement(ActionSheet, { label: "More actions for Bench Press", title: "Bench Press" },
        React.createElement(RemoveExerciseButton, {
          sessionId: 7, position: 2, canRemove: true, dissolvesSuperset: false,
        })),
    );
    await React.act(async () => trigger("More actions for Bench Press").click());

    // Act — the two-step confirm, inside the sheet
    await React.act(async () => buttonWithText("Remove").click());
    assert.ok(dialog(), "the first step closed the sheet before the confirm");
    const confirm = [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Remove",
    );
    assert.ok(confirm, "no confirming Remove in the sheet");
    await React.act(async () => confirm.click());

    // Assert
    assert.deepEqual(removed, [2]);
    assert.ok(dialog() === null, "the sheet outlived the exercise it was acting on");
  });
});

test("a failed remove keeps the sheet open with the error in it", async () => {
  // Arrange
  await inDom(async (render) => {
    const [{ ActionSheet }, { RemoveExerciseButton }] = loadTsxGraph(
      [SHEET, "components/RemoveExerciseButton.tsx"],
      {
        "@/app/sessions/[id]/actions": {
          submitRemovePrescription: async () => ({ error: "Could not remove that exercise." }),
        },
      },
    );
    await render(
      React.createElement(ActionSheet, { label: "More actions for Bench Press", title: "Bench Press" },
        React.createElement(RemoveExerciseButton, {
          sessionId: 7, position: 2, canRemove: true, dissolvesSuperset: false,
        })),
    );
    await React.act(async () => trigger("More actions for Bench Press").click());
    await React.act(async () => buttonWithText("Remove").click());
    const confirm = [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Remove",
    )!;

    // Act
    await React.act(async () => confirm.click());

    // Assert
    assert.ok(dialog(), "a failure closed the sheet, taking its error with it");
    assert.match(dialog()!.textContent ?? "", /Could not remove that exercise\./);
  });
});

test("favoriting from a My Sessions row's sheet toggles it once and closes the sheet", async () => {
  // Arrange
  await inDom(async (render) => {
    const toggles: string[] = [];
    const { SessionCardRow } = loadTsx("components/SessionCardRow.tsx", {
      "@/app/sessions/actions": {
        submitToggleFavorite: async (_state: unknown, form: FormData) => {
          toggles.push(`${form.get("session_id")}:${form.get("favorite")}`);
          return { error: null };
        },
        submitDeleteSessionRow: async () => ({ error: null }),
      },
      "next/link": {
        __esModule: true,
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
          React.createElement("a", { href, ...rest }, children),
      },
    });
    const session = {
      id: 12, name: "Short Basic Upper", display_name: "Short Basic Upper", training_type: "strength",
      created_at: "2026-10-04T10:00:00", author: { display_name: null }, authored_by_me: true,
      is_favorite: false, exercise_count: 3, logged_count: 1,
      last_performed_on: "2026-10-04", preview_exercises: ["Bench Press"],
    };
    await render(React.createElement(SessionCardRow, { session }));
    const opener = [...document.querySelectorAll<HTMLButtonElement>("button[aria-haspopup='dialog']")];
    assert.equal(opener.length, 1, "the row should carry exactly one sheet trigger");
    await React.act(async () => opener[0].click());

    // Act
    await React.act(async () => buttonWithText("Favorite session").click());

    // Assert
    assert.deepEqual(toggles, ["12:true"]);
    assert.ok(dialog() === null, "the sheet stayed up after a one-tap action finished");
  }, "http://localhost/sessions");
});

// The Session detail's sheet (ADR-0133): Favorite is its first row, its toggle state held outside
// the sheet so a failure outlives the row that raised it.
function loadDetailSheet(submitFavorite: (state: unknown, form: FormData) => Promise<{ error: string | null }>) {
  return loadTsx("components/SessionActionsSheet.tsx", {
    "@/app/sessions/[id]/actions": { submitFavorite },
  });
}

test("favoriting from the Session detail's sheet toggles it once and closes the sheet", async () => {
  // Arrange
  await inDom(async (render) => {
    const toggles: string[] = [];
    const { SessionActionsSheet } = loadDetailSheet(async (_state, form) => {
      toggles.push(`${form.get("session_id")}:${form.get("favorite")}`);
      return { error: null };
    });
    await render(
      React.createElement(SessionActionsSheet, { sessionId: 7, isFavorite: true },
        React.createElement("button", { type: "button" }, "Rename")),
    );
    await React.act(async () => trigger("Session actions").click());
    const rows = [...dialog()!.querySelectorAll("button")].map((button) => button.textContent ?? "");
    assert.ok(rows[1]?.startsWith("Unfavorite session"), "Favorite is not the sheet's first row");

    // Act
    await React.act(async () => buttonWithText("Unfavorite session").click());

    // Assert
    assert.deepEqual(toggles, ["7:false"]);
    assert.ok(dialog() === null, "the sheet stayed up after a one-tap action finished");
  });
});

test("a failed favorite closes the sheet but keeps its error on the page", async () => {
  // Arrange
  await inDom(async (render) => {
    const { SessionActionsSheet } = loadDetailSheet(async () => ({
      error: "Could not update this favorite.",
    }));
    await render(
      React.createElement(SessionActionsSheet, { sessionId: 7, isFavorite: false }, null),
    );
    await React.act(async () => trigger("Session actions").click());

    // Act
    await React.act(async () => buttonWithText("Favorite session").click());

    // Assert
    assert.ok(dialog() === null, "the sheet stayed up after a one-tap action finished");
    const alert = document.querySelector('[role="alert"]');
    assert.equal(alert?.textContent, "Could not update this favorite.");
  });
});

test("the Session detail's sheet has no Favorite row where Favorite is not offered", async () => {
  // Arrange — a Protocol member: the server withholds the marker, the page passes `null`
  await inDom(async (render) => {
    const { SessionActionsSheet } = loadDetailSheet(async () => ({ error: null }));
    await render(
      React.createElement(SessionActionsSheet, { sessionId: 7, isFavorite: null },
        React.createElement("button", { type: "button" }, "Generate another")),
    );

    // Act
    await React.act(async () => trigger("Session actions").click());

    // Assert
    assert.equal(dialog()!.textContent?.includes("Favorite"), false);
    assert.equal(dialog()!.textContent?.includes("Generate another"), true);
  });
});
