import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue } from "./tsx-harness.ts";
import type { ExerciseDetail } from "./sessions-types.ts";
import type { ExercisePatchPayload } from "./admin-exercise-editor.ts";

// The admin Exercise editor page mounts several controls over one `exercise` prop, and most
// of them revalidate the route when they write (`revalidateExercise`) — so a sibling act
// (set the Provenance, retire, upload an image) re-runs the Server Component and hands these
// mounted forms *fresh* server values. A form that froze its fields at mount then shows
// stale text and lets the admin edit from it.
//
// These tests hold the reactive shape: a field the admin has not touched follows the server,
// a field they have touched keeps their typing, a field they typed and then undid goes back
// to following the server, and the patch is a diff against the server's current truth.

const ADMIN_URL = "http://localhost/admin/exercises/42";

type EditorComponent = (props: { exercise: ExerciseDetail }) => React.JSX.Element;

function exercise(overrides: Partial<ExerciseDetail> = {}): ExerciseDetail {
  return {
    id: 42,
    name: "Back Squat",
    description: "A barbell squat.",
    provenance: "user_entered",
    targeted_muscles: ["quads"],
    primary_muscles: [],
    secondary_muscles: [],
    muscle_highlight: {
      primary: { muscles: [], groups: [] },
      secondary: { muscles: [], groups: [] },
    },
    required_equipment: ["barbell"],
    instructions: ["Unrack.", "Descend."],
    difficulty: 4,
    precautions: ["Keep a neutral spine."],
    image: null,
    has_image: false,
    retired: false,
    reference_count: 0,
    variations: [],
    alternatives: [],
    ...overrides,
  };
}

function field(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

async function type(id: string, value: string): Promise<void> {
  await React.act(async () => setFieldValue(field(id), value));
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  assert.ok(button, `expected a "${label}" button`);
  await React.act(async () =>
    button!.dispatchEvent(new window.Event("click", { bubbles: true })),
  );
}

test("a refreshed exercise updates the fields the admin has not touched", async () => {
  // Arrange — the editor mounted on the exercise as the server first rendered it.
  const { restore } = mountDom({ url: ADMIN_URL });
  try {
    const { AdminExerciseEditor } = loadTsx<{ AdminExerciseEditor: EditorComponent }>(
      "components/AdminExerciseEditor.tsx",
      {
        "@/app/admin/exercises/actions": {
          updateExerciseAction: async () => ({ exercise: exercise(), error: null }),
        },
      },
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const render = async (detail: ExerciseDetail) =>
      React.act(async () =>
        root.render(React.createElement(AdminExerciseEditor, { exercise: detail })),
      );
    await render(exercise());
    assert.equal(field("exercise-name").value, "Back Squat");

    // Act — the admin edits the name, then a sibling control's write revalidates the route
    // and the Server Component hands down an enriched description.
    await type("exercise-name", "Barbell Back Squat");
    await render(exercise({ description: "An enriched description." }));

    // Assert — their typing survives, and the untouched field follows the server.
    assert.equal(field("exercise-name").value, "Barbell Back Squat");
    assert.equal(
      field("exercise-description").value,
      "An enriched description.",
      "an untouched field must follow the server, not the value it was mounted with",
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("the saved patch diffs against the server's current values, not the mounted ones", async () => {
  // Arrange — the same editor, recording what it would PATCH.
  const { restore } = mountDom({ url: ADMIN_URL });
  try {
    const sent: Partial<ExercisePatchPayload>[] = [];
    const { AdminExerciseEditor } = loadTsx<{ AdminExerciseEditor: EditorComponent }>(
      "components/AdminExerciseEditor.tsx",
      {
        "@/app/admin/exercises/actions": {
          updateExerciseAction: async (_id: number, patch: Partial<ExercisePatchPayload>) => {
            sent.push(patch);
            return { exercise: exercise({ name: "Barbell Back Squat" }), error: null };
          },
        },
      },
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const render = async (detail: ExerciseDetail) =>
      React.act(async () =>
        root.render(React.createElement(AdminExerciseEditor, { exercise: detail })),
      );
    await render(exercise());

    // Act — edit the name, take an enrichment of the description, then save.
    await type("exercise-name", "Barbell Back Squat");
    await render(exercise({ description: "An enriched description." }));
    await click("Save changes");

    // Assert — only the name is sent. A patch built against the mounted baseline would
    // also carry the old description and quietly undo the enrichment.
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { name: "Barbell Back Squat" });

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("an edit the server has since adopted stops counting as a pending change", async () => {
  // Arrange — the editor mounted, with an unsaved rename typed in.
  const { restore } = mountDom({ url: ADMIN_URL });
  try {
    const { AdminExerciseEditor } = loadTsx<{ AdminExerciseEditor: EditorComponent }>(
      "components/AdminExerciseEditor.tsx",
      {
        "@/app/admin/exercises/actions": {
          updateExerciseAction: async () => ({ exercise: exercise(), error: null }),
        },
      },
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const render = async (detail: ExerciseDetail) =>
      React.act(async () =>
        root.render(React.createElement(AdminExerciseEditor, { exercise: detail })),
      );
    await render(exercise());
    await type("exercise-name", "Barbell Back Squat");
    const save = () =>
      [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Save changes",
      )!;
    assert.equal(save().disabled, false, "a typed rename is a pending change");

    // Act — the route refreshes carrying that same name (another admin got there first, or
    // this admin's own save landed).
    await render(exercise({ name: "Barbell Back Squat" }));

    // Assert — there is nothing left to send, so Save does not offer a redundant write.
    assert.equal(field("exercise-name").value, "Barbell Back Squat");
    assert.equal(
      save().disabled,
      true,
      "a change the server already carries is not a pending save",
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("a field typed and then reverted goes back to following the server", async () => {
  // Arrange — the editor mounted, and a description the admin types into and then undoes.
  const { restore } = mountDom({ url: ADMIN_URL });
  try {
    const { AdminExerciseEditor } = loadTsx<{ AdminExerciseEditor: EditorComponent }>(
      "components/AdminExerciseEditor.tsx",
      {
        "@/app/admin/exercises/actions": {
          updateExerciseAction: async () => ({ exercise: exercise(), error: null }),
        },
      },
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const render = async (detail: ExerciseDetail) =>
      React.act(async () =>
        root.render(React.createElement(AdminExerciseEditor, { exercise: detail })),
      );
    await render(exercise());

    // Act — type, then retype exactly what the server had, then take a refresh that changes
    // that same field.
    await type("exercise-description", "A different description.");
    await type("exercise-description", "A barbell squat.");
    await render(exercise({ description: "An enriched description." }));

    // Assert — an undone edit is not a pending change, so the field is free to follow the
    // server again. Holding every keystroke would pin it on the value they backed out of.
    assert.equal(
      field("exercise-description").value,
      "An enriched description.",
      "a reverted field must stop outranking the server",
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("a refreshed exercise re-seeds the curator controls the admin has not touched", async () => {
  // Arrange — the curator controls mounted on the first render.
  const { restore } = mountDom({ url: ADMIN_URL });
  try {
    const { AdminExerciseCuration } = loadTsx<{ AdminExerciseCuration: EditorComponent }>(
      "components/AdminExerciseCuration.tsx",
      {
        "@/app/admin/exercises/actions": {
          setProvenanceAction: async () => ({ exercise: exercise(), error: null }),
          setPrecautionsAction: async () => ({ exercise: exercise(), error: null }),
        },
      },
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const render = async (detail: ExerciseDetail) =>
      React.act(async () =>
        root.render(React.createElement(AdminExerciseCuration, { exercise: detail })),
      );
    await render(exercise());
    assert.equal(field("exercise-provenance").value, "user_entered");

    // Act — the admin starts editing the precautions; meanwhile another admin promotes the
    // movement to Curated and the route revalidates.
    await type("exercise-precautions", "Warm up first.");
    await render(exercise({ provenance: "curated", precautions: ["Keep a neutral spine."] }));

    // Assert — the untouched select follows the server; the edited textarea does not lose
    // what was typed into it.
    assert.equal(
      field("exercise-provenance").value,
      "curated",
      "an untouched control must follow the server",
    );
    assert.equal(field("exercise-precautions").value, "Warm up first.");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});
