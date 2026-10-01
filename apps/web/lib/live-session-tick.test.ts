import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { JSDOM } from "jsdom";

import type { WorkoutSession } from "./sessions-types.ts";

// The Live Session is the one screen in the app that runs a wall-clock tick while the
// user works — a phone, mid-workout, with a Screen Wake Lock deliberately held. The
// tick must therefore reach only the two leaves that *display* time: the elapsed clock
// and the rest countdown. These tests hold that line, because nothing else does — a
// `now` lifted back into `LiveSessionScreen` would re-render the whole set table sixty
// times a minute and nothing would fail.
//
// They render the real TSX offline with the existing Node runner (no browser, no
// build), the way form-accessibility.test.ts does, and drive time with mocked timers.

const require = createRequire(import.meta.url);
function load(path: string, boundaries: Record<string, unknown> = {}): any {
  const filename = resolve(import.meta.dirname, "..", path);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): any => {
    if (name in boundaries) return boundaries[name];
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    const extension = existsSync(resolve(import.meta.dirname, "..", `${base}.ts`))
      ? ".ts"
      : ".tsx";
    return load(`${base}${extension}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

// Install a JSDOM window plus the act environment, and freeze the clock at 0 so every
// assertion below reads an exact timer face. Returns the teardown.
function mountDom(): { dom: JSDOM; restore: () => void } {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", {
    url: "http://localhost",
  });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  mock.timers.enable({ apis: ["setInterval", "Date"] });
  return {
    dom,
    restore: () => {
      mock.timers.reset();
      dom.window.close();
      for (const key of Object.keys(globals)) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test("the elapsed clock advances every second without re-rendering its owner", async () => {
  // Arrange — an owner that counts its own renders around the clock leaf.
  const { restore } = mountDom();
  try {
    const { ElapsedClock } = load("components/pulse/elapsed-clock.tsx");
    const { createRoot } = await import("react-dom/client");
    let ownerRenders = 0;
    function Owner(): React.JSX.Element {
      ownerRenders += 1;
      return React.createElement(
        "span",
        { "aria-label": "Elapsed time" },
        React.createElement(ElapsedClock, { startedAt: 0 }),
      );
    }
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () => root.render(React.createElement(Owner)));
    const face = () => document.querySelector('[aria-label="Elapsed time"]')!.textContent;
    assert.equal(face(), "0:00");
    const before = ownerRenders;

    // Act — three seconds of wall-clock.
    await React.act(async () => mock.timers.tick(3000));

    // Assert — the face moved, the owner did not render again.
    assert.equal(face(), "0:03");
    assert.equal(ownerRenders, before, "the tick must not reach the clock's owner");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("the rest countdown reports reaching zero exactly once", async () => {
  // Arrange — a three-second rest under an owner that re-renders on its own and hands a
  // *fresh* `onElapsed` arrow each time (the shape a caller written without useCallback
  // gives it). Both halves matter: the countdown must not re-fire on its own tick, and
  // must not re-fire because the handler it was given has a new identity.
  const { restore } = mountDom();
  try {
    const { RestCountdown } = load("components/pulse/rest-countdown.tsx");
    const { createRoot } = await import("react-dom/client");
    let elapsedCalls = 0;
    let rerenderOwner = () => {};
    function Owner(): React.JSX.Element {
      const [, setRenders] = React.useState(0);
      rerenderOwner = () => setRenders((count) => count + 1);
      return React.createElement(
        "span",
        { "aria-label": "Rest remaining" },
        React.createElement(RestCountdown, {
          endAt: 3000,
          onElapsed: () => {
            elapsedCalls += 1;
          },
        }),
      );
    }
    const root = createRoot(document.getElementById("root")!);
    await React.act(async () => root.render(React.createElement(Owner)));
    const face = () => document.querySelector('[aria-label="Rest remaining"]')!.textContent;

    // Act / Assert — it counts down, and says "over" only on the transition.
    assert.equal(face(), "0:03");
    assert.equal(elapsedCalls, 0);
    await React.act(async () => mock.timers.tick(1000));
    assert.equal(face(), "0:02");
    assert.equal(elapsedCalls, 0);
    await React.act(async () => rerenderOwner());
    assert.equal(elapsedCalls, 0, "a fresh handler is not a reason to end a running rest");
    await React.act(async () => mock.timers.tick(2000));
    assert.equal(face(), "0:00");
    assert.equal(elapsedCalls, 1);
    await React.act(async () => mock.timers.tick(5000));
    assert.equal(elapsedCalls, 1, "a settled countdown must not re-fire each second");
    await React.act(async () => rerenderOwner());
    await React.act(async () => rerenderOwner());
    assert.equal(
      elapsedCalls,
      1,
      "nor once per owner render, however the handler was written",
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

const SESSION: WorkoutSession = {
  id: 42,
  clerk_user_id: "user_1",
  training_type: "strength",
  duration_minutes: 45,
  has_been_regenerated: false,
  prescriptions: [
    {
      position: 1,
      sets: 2,
      reps: "8",
      rest_seconds: 60,
      tempo: null,
      recommended_load: { kind: "absolute", text: "70 kg", kg: 70 },
      exercise_id: 100,
      exercise_name: "Back Squat",
      exercise_description: null,
      targeted_muscles: ["quads"],
      required_equipment: ["barbell"],
      provenance: "curated",
    },
  ],
};

// Mount the real LiveSessionScreen with its I/O boundaries stubbed and the set list
// replaced by a probe that records every render and the props it was handed.
async function mountLiveScreen(): Promise<{
  renders: Record<string, any>[];
  root: any;
}> {
  const renders: Record<string, any>[] = [];
  const { LiveSessionScreen } = load("components/LiveSessionScreen.tsx", {
    "@clerk/nextjs": { useAuth: () => ({ userId: "user_1", isLoaded: true }) },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "next/link": {
      __esModule: true,
      default: ({ children }: { children: React.ReactNode }) =>
        React.createElement("a", null, children),
    },
    "@/app/sessions/[id]/live/actions": {
      recordLiveSession: async () => ({ error: null }),
    },
    "@/app/actions/outbox": { deliverQueuedFinish: async () => {} },
    "@/lib/finish-outbox-sync": {
      drainOutbox: async () => {},
      enqueueFinish: async () => true,
    },
    "@/components/live-session-sets": {
      // Deliberately NOT memoized: this probe must observe every render its parent
      // performs, so a re-rendering parent cannot hide behind a memo boundary.
      LiveSessionSets: (props: Record<string, any>) => {
        renders.push(props);
        return null;
      },
    },
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  await React.act(async () =>
    root.render(
      React.createElement(LiveSessionScreen, {
        session: SESSION,
        today: "2026-09-30",
        defaultRestSeconds: 90,
        keepScreenAwake: false,
        unit: "kg",
      }),
    ),
  );
  return { renders, root };
}

test("a live session tick advances the elapsed face without re-rendering the set list", async () => {
  // Arrange — a started performance, with the set list rendered at least once.
  const { restore } = mountDom();
  try {
    const { renders, root } = await mountLiveScreen();
    const face = () => document.querySelector('[aria-label="Elapsed time"]')!.textContent;
    assert.ok(renders.length > 0, "the set list renders once the performance is live");
    assert.equal(face(), "0:00");
    const before = renders.length;

    // Act — five seconds pass with the user touching nothing.
    await React.act(async () => mock.timers.tick(5000));

    // Assert — only the clock moved.
    assert.equal(face(), "0:05");
    assert.equal(
      renders.length,
      before,
      "the per-second tick must not re-render the set table",
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("a re-render that leaves the performance untouched hands the set list identical props", async () => {
  // Arrange — complete the first set, which starts a rest countdown.
  const { restore } = mountDom();
  try {
    const { renders, root } = await mountLiveScreen();
    const last = () => renders[renders.length - 1];
    await React.act(async () =>
      last().onCompleteSet(0, 8, "absolute", "70", null),
    );
    const settled = last();
    assert.ok(
      document.querySelector('[aria-label="Rest remaining"]'),
      "completing a set starts the rest countdown",
    );
    const before = renders.length;

    // Act — skip the rest. That is pure screen state: the record does not change.
    await React.act(async () =>
      document
        .querySelector<HTMLElement>('[aria-label="Skip rest"]')!
        .dispatchEvent(new window.Event("click", { bubbles: true })),
    );

    // Assert — the screen re-rendered, but every prop kept its identity, so a memo
    // boundary on the set list is not defeated by a fresh array or a fresh arrow.
    assert.ok(renders.length > before, "skipping the rest re-renders the screen");
    const after = last();
    for (const key of [
      "units",
      "onCompleteSet",
      "onSkipSet",
      "onReopenSet",
      "onExpandUnit",
      "expandedUnits",
    ]) {
      assert.equal(after[key], settled[key], `${key} must be stable across the re-render`);
    }

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("the set list is memoized, so stable props skip its subtree entirely", () => {
  // Arrange / Act — the export itself carries the memo boundary.
  const { LiveSessionSets } = load("components/live-session-sets.tsx");

  // Assert
  assert.equal(
    (LiveSessionSets as { $$typeof?: symbol }).$$typeof,
    Symbol.for("react.memo"),
    "stable props only pay off behind React.memo",
  );
});
