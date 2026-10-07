import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { loadTsx, mountDom, type ModuleBoundaries } from "./tsx-harness.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// The Home Calibration control as a stepper (ADR-0111): the two directions are the two ends of
// one control and the standing offset sits between them, so the readout is where the eye
// already is when tapping. The view-model holds the copy; these hold the shape — which end is
// which, what a tap posts, and that the reset neither appears from nothing nor reflows the row.

const MODULE = "components/pulse/calibration-control.tsx";
const EASIER = "Make remaining sessions easier";
const HARDER = "Make remaining sessions harder";
const RESET = "Return remaining sessions to the written plan";

function makeProtocol(calibration: number): ProtocolProgress {
  return {
    id: 7,
    clerk_user_id: "user_1",
    training_type: "strength",
    objective: "hypertrophy",
    sessions_per_week: 3,
    weeks: 4,
    duration_minutes: 45,
    name: null,
    label: "hypertrophy · strength",
    sessions: [],
    next_session: null,
    completed_count: 0,
    calibration,
    calibration_min: -3,
    calibration_max: 3,
  };
}

interface Posted {
  protocolId: number;
  calibration: number;
}

function boundaries(posted: Posted[] = []): ModuleBoundaries {
  return {
    "@/app/dashboard/calibration-actions": {
      calibrateCurrentProtocol: async (protocolId: number, calibration: number) => {
        posted.push({ protocolId, calibration });
        return { error: null, calibration, atRail: false, sensitiveCaveat: false };
      },
    },
  };
}

function render(calibration: number): Document {
  const { CalibrationControl } = loadTsx(MODULE, boundaries());
  const markup = renderToStaticMarkup(
    React.createElement(CalibrationControl, { protocol: makeProtocol(calibration) }),
  );
  return new JSDOM(markup).window.document;
}

function byLabel(root: ParentNode, label: string): HTMLButtonElement {
  const match = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  assert.ok(match, `no button labelled "${label}"`);
  return match;
}

test("the two directions are the ends of one labelled control, the readout between them", () => {
  // Arrange & Act
  const document = render(2);

  // Assert — the group is named by the card's own label, so a screen reader hears what the
  // ends re-pitch before it hears either of them.
  const group = document.querySelector('[role="group"]');
  assert.ok(group, "no control group");
  const labelId = group.getAttribute("aria-labelledby");
  assert.ok(labelId);
  assert.equal(document.getElementById(labelId)?.textContent, "PITCH // REMAINING SESSIONS");

  const parts = [...group.children];
  assert.equal(parts.length, 3);
  assert.equal(parts[0].getAttribute("aria-label"), EASIER);
  assert.equal(parts[2].getAttribute("aria-label"), HARDER);
  assert.equal(parts[1].getAttribute("aria-live"), "polite");
  assert.equal(parts[1].textContent, "2 stepsHarder than written");
});

test("at the written plan the reset is withheld but keeps its place in the row", () => {
  // Arrange & Act
  const document = render(0);

  // Assert — `invisible` rather than unmounted: it is out of the accessibility tree and the
  // tab order, and the label row does not shift when the first tap brings it back.
  const reset = byLabel(document, RESET);
  assert.equal(reset.classList.contains("invisible"), true);
  assert.equal(reset.disabled, true);
});

test("off the written plan the reset is offered", () => {
  const reset = byLabel(render(-1), RESET);

  assert.equal(reset.classList.contains("invisible"), false);
  assert.equal(reset.disabled, false);
});

test("at the floor the easier end is refused and the rail explains itself", () => {
  // Arrange & Act
  const document = render(-3);

  // Assert — the other end stays open: a rail is not a lockout.
  assert.equal(byLabel(document, EASIER).disabled, true);
  assert.equal(byLabel(document, HARDER).disabled, false);
  const note = document.querySelector('[role="status"]');
  assert.ok(note, "no rail note");
  assert.match(note.textContent ?? "", /fitness level/i);
});

test("the card says what a re-pitch changes", () => {
  const text = render(1).body.textContent ?? "";

  assert.match(text, /every session you haven’t done yet/);
});

test("each end and the reset post the absolute offset they stand for", async () => {
  // Arrange
  const posted: Posted[] = [];
  const { CalibrationControl } = loadTsx(MODULE, boundaries(posted));
  const { restore } = mountDom();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);

  try {
    await React.act(async () =>
      root.render(React.createElement(CalibrationControl, { protocol: makeProtocol(2) })),
    );

    // Act
    await React.act(async () => byLabel(document, HARDER).click());
    await React.act(async () => byLabel(document, EASIER).click());
    await React.act(async () => byLabel(document, RESET).click());

    // Assert — absolute, not a delta (ADR-0111): the prop still says +2, so each tap posts
    // the offset one step from what the user can see, and reset posts zero.
    assert.deepEqual(posted, [
      { protocolId: 7, calibration: 3 },
      { protocolId: 7, calibration: 1 },
      { protocolId: 7, calibration: 0 },
    ]);
  } finally {
    await React.act(async () => root.unmount());
    restore();
  }
});
