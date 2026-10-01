import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue } from "./tsx-harness.ts";
import { supersetLayout } from "./supersets.ts";
import type { DraftPrescription, SupersetSlot } from "./protocol-builder.ts";
import type { PrescriptionEvent } from "./prescription-draft.ts";

// The Session editor's rows read the draft from one context instead of being handed it through
// three intermediaries (ADR-0105). What that buys is only real if an edit raised at the deepest
// leaf still lands on the right position — the thing 13 drilled callbacks proved by their own
// shape and a context has to prove by being exercised.
//
// So these tests mount the real `PrescriptionList` offline (`tsx-harness`, no browser, no build)
// and assert what reaches the dispatch seam. The interesting row is a **Superset member**: it
// sits `PrescriptionList → SupersetContainer → SortablePrescriptionRow → PrescriptionEditor`
// deep, which is exactly the path that used to re-declare the same 13 callbacks at every level.

const SOLO = "Back Squat";
const MEMBER_A = "Bench Press";
const MEMBER_B = "Barbell Row";

function prescription(
  name: string,
  overrides: Partial<DraftPrescription> = {},
): DraftPrescription {
  return {
    exerciseId: name.length,
    exerciseName: name,
    sets: 3,
    reps: "8-12",
    quantityKind: "repetitions",
    quantityUnit: "km",
    restSeconds: 90,
    tempo: null,
    loadKind: "absolute",
    loadValue: "60",
    supersetGroup: null,
    roundRestSeconds: null,
    scheme: null,
    setType: null,
    targetEffort: null,
    note: null,
    ...overrides,
  };
}

// A solo Prescription followed by a two-member Superset — the layout that exercises both render
// paths at once (a bare row, and a container wrapping its members).
const PRESCRIPTIONS: DraftPrescription[] = [
  prescription(SOLO),
  prescription(MEMBER_A, { supersetGroup: "g1", roundRestSeconds: 90 }),
  prescription(MEMBER_B, { supersetGroup: "g1", roundRestSeconds: 90 }),
];

type ListComponent = (props: {
  prescriptions: DraftPrescription[];
  layout: SupersetSlot[];
  locked: boolean;
  unit: string;
  dispatch: (event: PrescriptionEvent) => void;
}) => React.JSX.Element;

interface Mounted {
  readonly events: PrescriptionEvent[];
  readonly last: () => PrescriptionEvent;
}

// Mount the real row list with its one outward seam — the dispatch — recorded, run `body`
// against it, and tear the DOM down however that goes. The layout comes from the real
// `supersetLayout`, so the member badges, group size and round-rest placement are the ones the
// Builder actually renders. The globals JSDOM installs are process-wide, so the teardown is not
// optional: a test that leaks them breaks the next one.
async function withRows(
  options: { locked?: boolean },
  body: (mounted: Mounted) => Promise<void>,
): Promise<void> {
  const { restore } = mountDom();
  try {
    const events: PrescriptionEvent[] = [];
    const { PrescriptionList } = loadTsx<{ PrescriptionList: ListComponent }>(
      "components/builder/prescription-rows.tsx",
    );
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () =>
      root.render(
        React.createElement(PrescriptionList, {
          prescriptions: PRESCRIPTIONS,
          layout: supersetLayout(PRESCRIPTIONS),
          locked: options.locked ?? false,
          unit: "kg",
          dispatch: (event: PrescriptionEvent) => events.push(event),
        }),
      ),
    );
    await body({ events, last: () => events[events.length - 1] });
    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
}

function field(label: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  );
  assert.ok(element, `the rows render a control labelled "${label}"`);
  return element;
}

function press(label: string): void {
  const button = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  assert.ok(button, `the rows render a button labelled "${label}"`);
  button.dispatchEvent(new window.Event("click", { bubbles: true }));
}

test("a solo row's field edit is dispatched for that row's own position", async () => {
  await withRows({}, async ({ last }) => {
    // Act — the first row's Sets field.
    await React.act(async () => setFieldValue(field(`Sets for ${SOLO}`), "5"));

    // Assert
    assert.deepEqual(last(), {
      type: "EDIT_PRESCRIPTION",
      position: 0,
      field: "sets",
      value: 5,
    });
  });
});

test("a superset member's field edit carries its own position from four levels deep", async () => {
  await withRows({}, async ({ last }) => {
    // Act — the second member of the Superset: inside the container, inside the sortable row,
    // inside the editor. Nothing on that path forwards a callback any more.
    await React.act(async () =>
      setFieldValue(field(`Sets for ${MEMBER_B}`), "4"),
    );

    // Assert — position 2, not the container's first member and not the solo above it.
    assert.deepEqual(last(), {
      type: "EDIT_PRESCRIPTION",
      position: 2,
      field: "sets",
      value: 4,
    });
  });
});

test("the superset's round rest is dispatched at the group's first position", async () => {
  // The group owns one round-rest (ADR-0023), so the edit must address the group, not whichever
  // member happens to carry the field.
  await withRows({}, async ({ last }) => {
    // Act
    await React.act(async () =>
      setFieldValue(field("Round rest for superset A"), "120"),
    );

    // Assert
    assert.deepEqual(last(), {
      type: "EDIT_ROUND_REST",
      position: 1,
      roundRestSeconds: 120,
    });
  });
});

test("the button floor dispatches reorder, ungroup and remove for the pressed row", async () => {
  // The keyboard/screen-reader floor (#153) reaches the same seam as the fields.
  await withRows({}, async ({ last }) => {
    // Act / Assert — move the solo row down.
    await React.act(async () => press(`Move ${SOLO} down`));
    assert.deepEqual(last(), {
      type: "REORDER_PRESCRIPTION",
      from: 0,
      to: 1,
    });

    // Act / Assert — dissolve the Superset from its second member.
    await React.act(async () => press(`Ungroup ${MEMBER_B} from its superset`));
    assert.deepEqual(last(), { type: "UNGROUP", position: 2 });

    // Act / Assert — remove the first member.
    await React.act(async () => press(`Remove ${MEMBER_A}`));
    assert.deepEqual(last(), { type: "REMOVE_PRESCRIPTION", position: 1 });
  });
});

test("a performed session renders settled record with nothing to edit", async () => {
  // The frozen prefix (ADR-0020). The context is still provided; what changes is that the
  // read-only branch renders no control that could raise an event.
  await withRows({ locked: true }, async ({ events }) => {
    // Assert — the names are readable, and there is no field, no button, no dispatch.
    assert.match(document.body.textContent ?? "", new RegExp(MEMBER_B));
    assert.equal(document.querySelectorAll("input").length, 0);
    assert.equal(document.querySelectorAll("button").length, 0);
    assert.deepEqual(events, []);
  });
});
