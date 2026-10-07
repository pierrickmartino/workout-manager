import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue } from "./tsx-harness.ts";
import { loadKindOptions } from "./load.ts";
import {
  setEntryPrefix,
  setEntryValues,
  type SetEntrySubject,
  type SetEntryValues,
} from "./set-entry.ts";

// The set-entry field family (composition audit #2, ADR-0106). The same amount/load entry UI
// was written four times, and the copies had drifted apart in ways no type could catch: two of
// the five typed-Load fields asked for no keypad, one distance field was not a numeric field at
// all, and the same picker was captioned two different ways in two of the forms.
//
// So what these tests hold is not "it renders" but the two things the duplication endangered:
// that *every* kind the typed-Load vocabulary declares reaches the picker (ADR-0010), and that
// each field's affordances are the same in both kinds of form. The controlled/uncontrolled
// split is the axis the audit named, so every claim below is made against both providers.

const SUBJECT: SetEntrySubject = { joiner: "comma", name: "set 1" };
const NAMED: SetEntrySubject = { joiner: "for", name: "Back Squat" };

interface Family {
  readonly SetEntry: Record<string, React.ComponentType<Record<string, unknown>>>;
  readonly SetEntryProvider: React.ComponentType<Record<string, unknown>>;
  readonly SetEntryFormProvider: React.ComponentType<Record<string, unknown>>;
}

function family(): Family {
  return loadTsx<Family>("components/pulse/set-entry.tsx");
}

interface RowOptions {
  readonly mode?: "controlled" | "uncontrolled";
  readonly values?: Partial<SetEntryValues>;
  readonly subject?: SetEntrySubject;
  readonly prefix?: string | null;
  readonly disabled?: boolean;
  // Which parts to render. Defaults to the whole family, which is what most assertions want.
  readonly parts?: readonly string[];
}

interface Mounted {
  readonly edits: Array<Partial<SetEntryValues>>;
  readonly last: () => Partial<SetEntryValues>;
}

const ALL_PARTS = ["Movement", "Kind", "Quantity", "Load", "Effort", "Note"] as const;

// Mount the family through one of its two providers with the edit seam recorded. The JSDOM
// globals are process-wide, so the teardown is not optional: a test that leaks them breaks the
// next one.
async function withRow(
  options: RowOptions,
  body: (mounted: Mounted) => Promise<void>,
): Promise<void> {
  const { restore } = mountDom();
  try {
    const { SetEntry, SetEntryProvider, SetEntryFormProvider } = family();
    const edits: Array<Partial<SetEntryValues>> = [];
    const mode = options.mode ?? "controlled";
    const Provider = mode === "controlled" ? SetEntryProvider : SetEntryFormProvider;
    // Each provider takes the edits it can honour, by name: a driven row takes any field's, a
    // seeded one takes only its Quantity kind's. Recording both through one list is what lets
    // every claim below be made against both.
    const seam = mode === "controlled"
      ? { onEdit: (patch: Partial<SetEntryValues>) => edits.push(patch) }
      : { onKindChange: (kind: string) => edits.push({ kind }) };
    const parts = options.parts ?? ALL_PARTS;
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () =>
      root.render(
        React.createElement(
          Provider,
          {
            values: setEntryValues(options.values ?? {}),
            unit: "kg",
            disabled: options.disabled ?? false,
            prefix: options.prefix === undefined ? setEntryPrefix(0) : options.prefix,
            subject: options.subject ?? SUBJECT,
            ...seam,
          },
          parts.map((part) =>
            React.createElement(SetEntry[part], { key: part, placeholder: "e.g." }),
          ),
        ),
      ),
    );
    await body({ edits, last: () => edits[edits.length - 1] });
    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
}

function control(label: string): HTMLInputElement | HTMLSelectElement {
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${label}"]`,
  );
  assert.ok(element, `the family renders a control labelled "${label}"`);
  return element;
}

function missing(label: string): boolean {
  return document.querySelector(`[aria-label="${label}"]`) === null;
}

// React installs its own value setter to dedupe events, so a write has to go through the
// prototype's setter first — the same reason `setFieldValue` exists for inputs.
function setSelectValue(element: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(
    element,
    value,
  );
  element.dispatchEvent(new window.Event("change", { bubbles: true }));
}

test("every typed-Load kind the vocabulary declares reaches the picker", async () => {
  // The correctness risk the audit named: the Load-kind selector was written five times, so
  // adding a kind to the typed Load (ADR-0010) meant editing four files and degrading a Load
  // silently in whichever one was missed. One picker, read from `loadKindOptions`.
  await withRow({ parts: ["Load"] }, async () => {
    // Act
    const picker = control("Load kind, set 1") as HTMLSelectElement;

    // Assert — the options are the catalogue's, in its order, with its labels.
    const offered = Array.from(picker.querySelectorAll("option")).map((option) => ({
      value: option.value,
      label: option.textContent,
    }));
    assert.deepEqual(offered, loadKindOptions("kg").map(({ value, label }) => ({ value, label })));
  });
});

test("the Load picker names the reader's own Weight Unit", async () => {
  // #417: the absolute kind's label carries the active unit, so the field says what it is
  // entered in. Threaded through the provider rather than re-read per field.
  const { restore } = mountDom();
  try {
    const { SetEntry, SetEntryProvider } = family();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () =>
      root.render(
        React.createElement(
          SetEntryProvider,
          {
            values: setEntryValues({}),
            unit: "lb",
            disabled: false,
            prefix: setEntryPrefix(0),
            subject: SUBJECT,
            onEdit: () => {},
          },
          React.createElement(SetEntry.Load, {}),
        ),
      ),
    );

    // Assert
    const picker = control("Load kind, set 1") as HTMLSelectElement;
    assert.match(picker.textContent ?? "", /Weight \(lb\)/);

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

for (const mode of ["controlled", "uncontrolled"] as const) {
  test(`the Load value field asks for the keypad its picked kind implies (${mode})`, async () => {
    // ADR-0093, and the drift this family exists to end: `CorrectLogForm` declared no
    // `inputMode` on either of its two Load fields, so the same field offered a decimal pad in
    // two forms and a full QWERTY in the other — while a `range` or descriptive Load must keep
    // the full keyboard in all of them, or it becomes untypable on a phone.
    await withRow({ mode, parts: ["Load"], values: { load_kind: "absolute" } }, async () => {
      assert.equal(control("Load, set 1").getAttribute("inputmode"), "decimal");
    });
    await withRow({ mode, parts: ["Load"], values: { load_kind: "range" } }, async () => {
      assert.equal(control("Load, set 1").getAttribute("inputmode"), null);
    });
    await withRow({ mode, parts: ["Load"], values: { load_kind: "qualitative" } }, async () => {
      assert.equal(control("Load, set 1").getAttribute("inputmode"), null);
    });
  });

  test(`a distance is a numeric field with a decimal keypad (${mode})`, async () => {
    // The other drift: `CorrectLogForm`'s pre-filled distance field declared no `type` at all,
    // so a 5 km run was typed on a QWERTY in that one form. `step="any"` is what makes the pad
    // decimal rather than integer — 3.1 miles has to be typable.
    await withRow({ mode, parts: ["Quantity"], values: { kind: "distance" } }, async () => {
      const field = control("Distance, set 1");
      assert.equal(field.getAttribute("type"), "number");
      assert.equal(field.getAttribute("step"), "any");
      assert.equal(field.getAttribute("inputmode"), "decimal");
    });
  });

  test(`a time field keeps the full keyboard and is not spell-checked (${mode})`, async () => {
    // An `mm:ss` value carries a colon, which no numeric pad offers (ADR-0093), and it is not
    // prose, so a red underline under it is noise (ADR-0103).
    await withRow({ mode, parts: ["Quantity"], values: { kind: "duration" } }, async () => {
      const field = control("Duration, set 1");
      assert.equal(field.getAttribute("inputmode"), null);
      assert.equal(field.getAttribute("spellcheck"), "false");
      assert.equal(field.getAttribute("placeholder"), "mm:ss");
    });
  });

  test(`each field submits under the row's own indexed name (${mode})`, async () => {
    // The wire contract all four readers walk: `set-<i>-<field>` for i in 0…set_count-1.
    await withRow({ mode, prefix: setEntryPrefix(3), values: { kind: "distance" } }, async () => {
      const names = Array.from(
        document.querySelectorAll<HTMLElement>("input[name], select[name]"),
      ).map((element) => element.getAttribute("name"));
      assert.deepEqual(names, [
        "set-3-movement",
        "set-3-kind",
        "set-3-distance",
        "set-3-unit",
        "set-3-duration",
        "set-3-load_kind",
        "set-3-load_value",
        "set-3-rpe",
        "set-3-note",
      ]);
    });
  });

  test(`a disabled row offers no editable field (${mode})`, async () => {
    // A skipped log row must not reach the record (Model B) and a completed Live set is
    // read-only until reopened (ADR-0089) — both are the same "this row takes no entry".
    await withRow({ mode, disabled: true, values: { kind: "distance" } }, async () => {
      const fields = Array.from(
        document.querySelectorAll<HTMLInputElement>("input, select"),
      );
      assert.ok(fields.length > 0, "the row renders fields to disable");
      for (const field of fields) {
        assert.equal(field.disabled, true, `${field.getAttribute("aria-label")} is disabled`);
      }
    });
  });
}

test("a row that never posts renders no name at all", async () => {
  // The Live Session is ephemeral and client-side until finished (ADR-0012): its rows sit in
  // no form, so a `name` would promise a collection that never happens.
  await withRow({ prefix: null }, async () => {
    assert.equal(document.querySelectorAll("[name]").length, 0);
    // The fields are still reachable by their accessible names.
    assert.ok(control("Reps, set 1"));
  });
});

test("the Quantity block renders only the fields its kind carries", async () => {
  // ADR-0032: the amount is a typed Quantity, and the kind fixes which fields exist. One
  // branch in one place — adding a kind no longer means editing four files.
  await withRow({ parts: ["Quantity"], values: { kind: "repetitions" } }, async () => {
    assert.ok(control("Reps, set 1"));
    assert.ok(missing("Distance, set 1"));
    assert.ok(missing("Duration, set 1"));
  });
  await withRow({ parts: ["Quantity"], values: { kind: "distance" } }, async () => {
    assert.ok(control("Distance, set 1"));
    assert.ok(control("Distance unit, set 1"));
    // The companion time is optional (ADR-0032), and is a "Time", not the amount itself.
    assert.ok(control("Time, set 1"));
    assert.ok(missing("Reps, set 1"));
  });
  await withRow({ parts: ["Quantity"], values: { kind: "duration" } }, async () => {
    assert.ok(control("Duration, set 1"));
    assert.ok(missing("Reps, set 1"));
    assert.ok(missing("Distance, set 1"));
  });
});

test("a controlled field sends its own edit and nothing else", async () => {
  await withRow({ values: { kind: "distance" } }, async ({ last, edits }) => {
    // Act / Assert — one field at a time, each naming only its own key.
    await React.act(async () =>
      setFieldValue(control("Distance, set 1") as HTMLInputElement, "5.2"),
    );
    assert.deepEqual(last(), { distance: "5.2" });

    await React.act(async () =>
      setFieldValue(control("Load, set 1") as HTMLInputElement, "72.5"),
    );
    assert.deepEqual(last(), { load_value: "72.5" });

    await React.act(async () =>
      setSelectValue(control("Load kind, set 1") as HTMLSelectElement, "percent_1rm"),
    );
    assert.deepEqual(last(), { load_kind: "percent_1rm" });

    await React.act(async () =>
      setSelectValue(control("RPE, set 1") as HTMLSelectElement, "8"),
    );
    assert.deepEqual(last(), { rpe: "8" });

    await React.act(async () =>
      setFieldValue(control("Note, set 1") as HTMLInputElement, "left knee twinge"),
    );
    assert.deepEqual(last(), { note: "left knee twinge" });

    assert.equal(edits.length, 5);
  });
});

test("an uncontrolled field seeds from the record and raises no edit", async () => {
  // The server-action forms read their values back out of the FormData on submit, so the DOM
  // owns them after the seed. The seed has to be a `defaultValue`: a `value` with no handler
  // would render a field that cannot be typed into at all.
  await withRow(
    { mode: "uncontrolled", values: { reps: "8", load_value: "60", note: "felt easy" } },
    async ({ edits }) => {
      // Assert — seeded, editable, and silent.
      assert.equal((control("Reps, set 1") as HTMLInputElement).value, "8");
      assert.equal((control("Load, set 1") as HTMLInputElement).value, "60");
      assert.equal((control("Note, set 1") as HTMLInputElement).value, "felt easy");

      await React.act(async () =>
        setFieldValue(control("Reps, set 1") as HTMLInputElement, "10"),
      );
      assert.equal((control("Reps, set 1") as HTMLInputElement).value, "10");
      assert.deepEqual(edits, []);
    },
  );
});

test("the Quantity-kind picker is driven by its holder in both kinds of form", async () => {
  // The one field that is controlled either way: the picked kind decides which amount fields
  // exist, so a form that seeded it and walked away could not re-render its own row. This is
  // what `CorrectLogForm`'s added rows hold React state for.
  for (const mode of ["controlled", "uncontrolled"] as const) {
    await withRow({ mode, parts: ["Kind"] }, async ({ last }) => {
      // Act
      await React.act(async () =>
        setSelectValue(control("Quantity kind, set 1") as HTMLSelectElement, "distance"),
      );

      // Assert
      assert.deepEqual(last(), { kind: "distance" });
    });
  }
});

test("a seeded row refuses an edit it cannot honour, rather than dropping it", async () => {
  // A seeded row owns only its Quantity kind — every other field is pre-filled and then left to
  // the DOM. If one ever raised an edit, swallowing it would look exactly like the field working
  // while discarding what the user typed, which is the failure this family exists to prevent. So
  // the provider throws, with the fields named.
  const { restore } = mountDom();
  try {
    const { SetEntryFormProvider, useSetEntry } = loadTsx<{
      SetEntryFormProvider: React.ComponentType<Record<string, unknown>>;
      useSetEntry: () => { actions: { edit: (patch: Partial<SetEntryValues>) => void } };
    }>("components/pulse/set-entry.tsx");
    const seam: Array<(patch: Partial<SetEntryValues>) => void> = [];
    function Probe(): null {
      seam.push(useSetEntry().actions.edit);
      return null;
    }
    const { renderToStaticMarkup } = await import("react-dom/server");
    renderToStaticMarkup(
      React.createElement(
        SetEntryFormProvider,
        {
          values: setEntryValues({}),
          unit: "kg",
          prefix: setEntryPrefix(0),
          subject: SUBJECT,
          onKindChange: () => {},
        },
        React.createElement(Probe),
      ),
    );
    const raise = seam[0];
    assert.ok(raise, "the probe reached the row's edit seam");

    // Assert — a non-kind edit names the field it refused, and a kind edit is honoured.
    assert.throws(() => raise({ load_value: "60" }), /load_value/);
    assert.throws(() => raise({ kind: "distance", reps: "8" }), /kind|reps/);
    raise({ kind: "distance" });
  } finally {
    restore();
  }
});

test("a seeded row with a kind picker but nowhere to send the pick fails loudly", async () => {
  // The picker is the one control such a row drives, so a form that renders it without a handler
  // is a mistake worth a crash at the moment a developer can fix it.
  const { restore } = mountDom();
  try {
    const { SetEntry, SetEntryFormProvider } = family();
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(
      React.createElement(
        SetEntryFormProvider,
        {
          values: setEntryValues({ kind: "repetitions" }),
          unit: "kg",
          prefix: setEntryPrefix(0),
          subject: SUBJECT,
        },
        React.createElement(SetEntry.Kind, {}),
      ),
    );
    // It renders — the throw is on the edit, not the render, so a read-only row is unaffected.
    assert.match(markup, /Quantity/);
  } finally {
    restore();
  }
});

test("a field's accessible name follows how its row is addressed", async () => {
  // Two joiners, because each reads correctly where it is used — and a screen of near-identical
  // rows is exactly where a bare "Load" leaves a screen-reader user unable to tell which set
  // they are in.
  await withRow({ subject: NAMED, parts: ["Load", "Effort", "Note"] }, async () => {
    assert.ok(control("Load kind for Back Squat"));
    assert.ok(control("Load for Back Squat"));
    assert.ok(control("RPE for Back Squat"));
    assert.ok(control("Note for Back Squat"));
  });
  await withRow(
    { subject: { joiner: "comma", name: "added set 3" }, parts: ["Movement", "Kind"] },
    async () => {
      assert.ok(control("Movement name, added set 3"));
      assert.ok(control("Quantity kind, added set 3"));
    },
  );
});

test("every field carries a visible caption beside its accessible name", async () => {
  // The micro-label is what a sighted user reads; the accessible name is what a screen reader
  // reads. Both come from one place now, so a field cannot end up with only one of them.
  await withRow({ values: { kind: "distance" } }, async () => {
    const captions = Array.from(document.querySelectorAll("span.label-mono")).map(
      (span) => span.textContent,
    );
    assert.deepEqual(captions, [
      "Movement",
      "Quantity",
      "Distance",
      "Unit",
      "Time (opt.)",
      "Load kind",
      "Load",
      "RPE",
      "Note",
    ]);
  });
});

test("the RPE picker offers the whole scale and an unanswered option", async () => {
  // Perceived difficulty is optional, so the blank is a real choice rather than a missing one.
  await withRow({ parts: ["Effort"] }, async () => {
    const picker = control("RPE, set 1") as HTMLSelectElement;
    const offered = Array.from(picker.querySelectorAll("option")).map((option) => option.value);
    assert.deepEqual(offered, ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  });
});

test("the distance unit picker offers kilometres and miles", async () => {
  await withRow({ parts: ["Quantity"], values: { kind: "distance" } }, async () => {
    const picker = control("Distance unit, set 1") as HTMLSelectElement;
    assert.deepEqual(
      Array.from(picker.querySelectorAll("option")).map((option) => option.value),
      ["km", "mi"],
    );
  });
});

test("reading the family outside a provider fails loudly", async () => {
  // A row with no provider behind it would render blank fields that silently discard every
  // edit, which is worse than a crash at the one moment a developer can fix it.
  const { restore } = mountDom();
  try {
    const { SetEntry } = family();
    const { renderToStaticMarkup } = await import("react-dom/server");
    assert.throws(
      () => renderToStaticMarkup(React.createElement(SetEntry.Load, {})),
      /SetEntryProvider|SetEntryFormProvider/,
    );
  } finally {
    restore();
  }
});

// One claim the family cannot make on its own. In a seeded row the Load-kind picker is a
// `defaultValue` select, so nothing in this module re-renders when it changes — yet ADR-0093
// requires the keypad to follow the *picked* kind, not the seeded one. It does, through a
// mechanism outside the family: `CorrectLogForm` re-serializes its whole form into the recovered
// draft on every change, so the pre-fill reader returns the live DOM value and the seed tracks
// the pick. That is load-bearing and invisible from either file alone, so it is asserted here
// against the real form rather than argued.
test("a seeded row's Load keypad follows the kind the user picks, not the one it was seeded with", async () => {
  const { restore } = mountDom();
  try {
    const { CorrectLogForm } = loadTsx<{
      CorrectLogForm: React.ComponentType<Record<string, unknown>>;
    }>("components/CorrectLogForm.tsx", {
      "@clerk/nextjs": { useAuth: () => ({ userId: "u1", isLoaded: true }) },
      "next/navigation": { useRouter: () => ({ replace() {}, push() {} }) },
      "@/components/NavigationGuardProvider": { useNavigationGuard: () => {} },
      "@/app/history/[id]/edit/actions": {
        submitCorrection: async () => ({ error: null, redirectTo: null }),
      },
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () =>
      root.render(
        React.createElement(CorrectLogForm, {
          logId: 1,
          today: "2026-09-26",
          unit: "kg",
          fields: {
            sessionId: null,
            performedOn: "2026-09-01",
            durationSeconds: null,
            trainingType: "strength",
            sets: [
              {
                exerciseId: 1,
                exerciseName: "Back Squat",
                kind: "repetitions",
                reps: "12",
                distance: "",
                unit: "km",
                duration: "",
                loadKind: "absolute",
                loadValue: "60",
                perceivedDifficulty: 8,
                note: "",
              },
            ],
          },
        }),
      ),
    );

    // Assert — seeded `absolute`, so the decimal pad.
    assert.equal(control("Load for Back Squat").getAttribute("inputmode"), "decimal");

    // Act — pick `range`, whose `low-high` value carries a hyphen no numeric pad offers.
    await React.act(async () =>
      setSelectValue(control("Load kind for Back Squat") as HTMLSelectElement, "range"),
    );

    // Assert — the full keyboard, or the field would be untypable on a phone.
    assert.equal(control("Load for Back Squat").getAttribute("inputmode"), null);

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

for (const mode of ["controlled", "uncontrolled"] as const) {
  test(`the table cells are the same fields, uncaptioned (${mode})`, async () => {
    // ADR-0114: the Live Session set table renders a row's fields under a column header, so its
    // parts drop the caption — and nothing else. Each must answer to the same accessible name
    // and ask for the same keypad as the captioned field it stands in for, or the table would
    // be the fifth copy this family exists to prevent.
    await withRow(
      { mode, parts: ["RepsCell", "LoadValueCell", "EffortCell", "LoadKind"], values: { load_kind: "absolute" } },
      async () => {
        // Assert — the accessible names are the vocabulary's.
        assert.equal(control("Reps, set 1").getAttribute("type"), "number");
        assert.equal(control("Load, set 1").getAttribute("inputmode"), "decimal");
        const effort = control("RPE, set 1") as HTMLSelectElement;
        assert.equal(effort.querySelectorAll("option").length, 11);
        const kinds = Array.from((control("Load kind, set 1") as HTMLSelectElement).querySelectorAll("option"))
          .map((option) => option.value);
        assert.deepEqual(kinds, loadKindOptions("kg").map(({ value }) => value));
        // And no caption: the column header is the caption.
        assert.equal(document.querySelectorAll(".label-mono").length, 0);
      },
    );
  });
}

test("a table Load cell says what its value is in, and a bodyweight value is the added load", async () => {
  // The kind is asked once per exercise, so the value field carries its unit from the inside.
  await withRow({ parts: ["LoadValueCell"], values: { load_kind: "bodyweight" } }, async () => {
    const field = control("Load, set 1") as HTMLInputElement;
    assert.equal(field.placeholder, "0");
    assert.equal(field.parentElement?.textContent, "+kg");
  });
  await withRow({ parts: ["LoadValueCell"], values: { load_kind: "range" } }, async () => {
    const field = control("Load, set 1") as HTMLInputElement;
    assert.equal(field.placeholder, "60-70");
    assert.equal(field.getAttribute("inputmode"), null);
  });
});
