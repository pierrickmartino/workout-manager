import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, type ModuleBoundaries } from "./tsx-harness.ts";
import {
  CALIBRATION_NOT_SAVED,
  CALIBRATION_UNCONFIRMED,
  SENSITIVE_CAVEAT,
} from "./calibration-control.ts";
import type { ProtocolProgress } from "./protocols-types.ts";

// The Calibration control when the network leaves a re-pitch uncertain (ADR-0111, "Uncertain
// results"). A thrown action is not an answer: the post may have failed before the server
// committed, or committed and lost its reply. The control re-reads the stored offset to tell
// the two apart, and a retry re-posts the same absolute target, so it can never double-step.
//
// The fake server below holds the one stored offset and fails on cue, either side of the
// commit — the two fault paths the audit asked to inject.

const MODULE = "components/pulse/calibration-control.tsx";
const HARDER = "Make remaining sessions harder";
const EASIER = "Make remaining sessions easier";
const RETRY = "Try again";

type Fault = "before-commit" | "after-commit" | "none";

interface FakeServer {
  stored: number;
  posts: number[];
  reads: number;
  // Consumed one per post; once empty, every post succeeds.
  faults: Fault[];
  readFails: boolean;
  sensitive: boolean;
}

function makeServer(overrides: Partial<FakeServer> = {}): FakeServer {
  return {
    stored: 0,
    posts: [],
    reads: 0,
    faults: [],
    readFails: false,
    sensitive: false,
    ...overrides,
  };
}

function boundaries(server: FakeServer): ModuleBoundaries {
  return {
    "@/app/dashboard/calibration-actions": {
      calibrateCurrentProtocol: async (_protocolId: number, calibration: number) => {
        server.posts.push(calibration);
        const fault = server.faults.shift() ?? "none";
        if (fault === "before-commit") {
          throw new TypeError("fetch failed");
        }
        server.stored = calibration;
        if (fault === "after-commit") {
          throw new TypeError("fetch failed");
        }
        return {
          error: null,
          calibration,
          atRail: false,
          sensitiveCaveat: server.sensitive,
        };
      },
      readCurrentCalibration: async () => {
        server.reads += 1;
        if (server.readFails) {
          throw new TypeError("fetch failed");
        }
        return { calibration: server.stored };
      },
    },
  };
}

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

function byLabel(label: string): HTMLButtonElement {
  const match = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  assert.ok(match, `no button labelled "${label}"`);
  return match;
}

function retryButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll("button")].find((button) => button.textContent === RETRY) ??
    null
  );
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

// Mount the control against a fake server, run the scenario, and fail the test if any promise
// was left rejected — the audit's original defect was exactly that.
async function withControl(
  server: FakeServer,
  scenario: () => Promise<void>,
): Promise<void> {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown): void => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onRejection);
  const { CalibrationControl } = loadTsx(MODULE, boundaries(server));
  const { restore } = mountDom();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);

  try {
    await React.act(async () =>
      root.render(React.createElement(CalibrationControl, { protocol: makeProtocol(0) })),
    );
    await scenario();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(rejections, [], "a rejection went unhandled");
  } finally {
    await React.act(async () => root.unmount());
    restore();
    process.off("unhandledRejection", onRejection);
  }
}

async function tap(button: HTMLButtonElement): Promise<void> {
  await React.act(async () => button.click());
}

test("a post that fails before the commit reads back as not saved, and a retry lands it once", async () => {
  // Arrange
  const server = makeServer({ faults: ["before-commit"] });

  await withControl(server, async () => {
    // Act
    await tap(byLabel(HARDER));

    // Assert — the re-read proves nothing moved, so the control says so plainly.
    assert.equal(server.stored, 0);
    assert.equal(server.reads, 1);
    const alert = document.querySelector('[role="alert"]');
    assert.ok(alert, "no error alert");
    assert.match(alert.textContent ?? "", new RegExp(CALIBRATION_NOT_SAVED));
    const retry = retryButton();
    assert.ok(retry, "no retry");

    // Act — the retry posts the retained target, not one recomputed from the readout.
    await tap(retry);

    // Assert — exactly one notch: two posts of the same absolute target.
    assert.deepEqual(server.posts, [1, 1]);
    assert.equal(server.stored, 1);
    assert.equal(retryButton(), null);
    assert.ok(!bodyText().includes(CALIBRATION_NOT_SAVED));
  });
});

test("a lost reply after the commit reads back as saved and stays silent", async () => {
  // Arrange
  const server = makeServer({ faults: ["after-commit"] });

  await withControl(server, async () => {
    // Act
    await tap(byLabel(HARDER));

    // Assert — the stored offset is the target, so this is a normal success: no notice, no
    // retry. The quiet re-post is the same absolute target, so it cannot step again.
    assert.equal(server.stored, 1);
    assert.equal(server.reads, 1);
    assert.ok(server.posts.every((posted) => posted === 1));
    assert.equal(retryButton(), null);
    assert.ok(!bodyText().includes(CALIBRATION_NOT_SAVED));
    assert.ok(!bodyText().includes(CALIBRATION_UNCONFIRMED));
  });
});

test("a lost reply still shows the Sensitive Constraint caveat", async () => {
  // Arrange — ADR-0058: the caveat must not be lost to a flaky network.
  const server = makeServer({ faults: ["after-commit"], sensitive: true });

  await withControl(server, async () => {
    // Act
    await tap(byLabel(EASIER));

    // Assert
    assert.equal(server.stored, -1);
    assert.ok(bodyText().includes(SENSITIVE_CAVEAT), "the caveat was lost");
  });
});

test("when the re-read fails too the result is unconfirmed, as a status, with a retry", async () => {
  // Arrange
  const server = makeServer({ faults: ["after-commit"], readFails: true });

  await withControl(server, async () => {
    // Act
    await tap(byLabel(HARDER));

    // Assert — announced politely: nothing the user did is known to have failed.
    const status = [...document.querySelectorAll('[role="status"]')].find((node) =>
      (node.textContent ?? "").includes(CALIBRATION_UNCONFIRMED),
    );
    assert.ok(status, "no unconfirmed status");
    assert.equal(document.querySelector('[role="alert"]'), null);

    // Act — the network comes back.
    server.readFails = false;
    await tap(retryButton()!);

    // Assert — the retry converges on the one target.
    assert.deepEqual(server.posts, [1, 1]);
    assert.equal(server.stored, 1);
    assert.ok(!bodyText().includes(CALIBRATION_UNCONFIRMED));
  });
});

test("a new tap replaces an uncertain target and clears its notice", async () => {
  // Arrange
  const server = makeServer({ faults: ["before-commit"] });

  await withControl(server, async () => {
    await tap(byLabel(HARDER));
    assert.ok(bodyText().includes(CALIBRATION_NOT_SAVED));

    // Act — the user changes their mind instead of retrying.
    await tap(byLabel(EASIER));

    // Assert — the old target's retry is gone; only the new one was posted after it.
    assert.deepEqual(server.posts, [1, -1]);
    assert.equal(server.stored, -1);
    assert.equal(retryButton(), null);
    assert.ok(!bodyText().includes(CALIBRATION_NOT_SAVED));
  });
});
