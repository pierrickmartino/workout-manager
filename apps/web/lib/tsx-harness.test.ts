import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { loadTsx as importComponent } from "./tsx-harness.ts";

// The loader every render test depends on. Its own correctness is worth pinning rather than
// inferring from theirs: a `@/` specifier that silently resolved to the wrong module, or a
// boundary that was never substituted, would make every one of them assert something about a
// module nobody meant to load — and report a primitive's default as present when it is not.
//
// It is exercised against real components rather than written fixtures. A fixture tree would
// have to live under the web root for `@/` to resolve against it, where `icon-import-policy`'s
// whole-root sweep would read it mid-write on a parallel test run.
//
// There was a second loader (`offline-tsx.ts`) that four of these files used, written before
// this one and never given its module registry — the fix ADR-0105 made here after a shared
// `createContext` object became one copy per importer. A context that crosses two modules is
// exactly what `Field` now is (ADR-0107), so the older copy could not have tested it: the
// provider and the control would have read different contexts and the wiring would have
// reported itself absent. One loader, so there is one answer.

const session = {
  id: 7, training_type: "strength", name: "Upper Push", display_name: "Upper Push",
  created_at: "2026-09-01", author: { display_name: null }, authored_by_me: true,
  is_favorite: false, exercise_count: 5, logged_count: 2, last_performed_on: "2026-09-14",
  preview_exercises: ["Bench Press"],
};

// `RecentSessions` reaches a Server Action through its Client row; every render here holds it
// still, which is the substitution a real render test makes.
const actions = {
  submitToggleFavorite: async () => ({ error: null }),
  submitDeleteSessionRow: async () => ({ error: null }),
};

test("renders a real component, resolving @/ into both a .ts and a .tsx module", () => {
  // Arrange — `RecentSessions` reaches `@/lib/session-card` (a .ts) and
  // `@/components/SessionCard` (a .tsx), so one render covers both resolution branches, and
  // `react`/`next/link` inside that graph load for real.
  const { RecentSessions } = importComponent("components/RecentSessions.tsx", {
    "@/app/sessions/actions": actions,
  });

  // Act
  const document = new JSDOM(renderToStaticMarkup(
    React.createElement(RecentSessions, { sessions: [session] }))).window.document;

  // Assert
  assert.equal(document.querySelector("h3")!.textContent, "Upper Push");
  assert.ok(document.querySelector("svg"), "the sigil the nested .tsx module draws");
});

test("substitutes a boundary module by specifier, deep in the graph", () => {
  // Arrange — the point of the loader: hold a Server Action, a router or a heavy leaf still.
  // `workout-sigil` is three modules down, so a substitution that only covered the entry point
  // would not reach it.
  const { RecentSessions } = importComponent("components/RecentSessions.tsx", {
    "@/app/sessions/actions": actions,
    "@/components/pulse/workout-sigil": {
      WorkoutSigil: () => React.createElement("i", null, "stubbed sigil"),
    },
  });

  // Act
  const markup = renderToStaticMarkup(React.createElement(RecentSessions, { sessions: [session] }));

  // Assert
  assert.match(markup, /<i>stubbed sigil<\/i>/);
  // The real sigil is the graph's only `role="img"`; the decorative Play glyph stays.
  assert.doesNotMatch(markup, /role="img"/);
});

test("returns nothing for a component that renders nothing", () => {
  // Arrange — the loader hands back the module's real exports, not a wrapper, so a component
  // that returns null still returns null.
  const { RecentSessions } = importComponent("components/RecentSessions.tsx", {
    "@/app/sessions/actions": actions,
  });

  // Act / Assert
  assert.equal(renderToStaticMarkup(React.createElement(RecentSessions, { sessions: [] })), "");
});
