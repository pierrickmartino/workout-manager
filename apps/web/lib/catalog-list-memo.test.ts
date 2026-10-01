import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom } from "./tsx-harness.ts";
import type { CatalogTaxonomy } from "./exercise-taxonomy-types.ts";
import type { ExerciseSearchResult } from "./exercises-types.ts";

// The catalog screen is the app's one nested list over an unpaged set (ADR-0072): every
// Movement Pattern section maps its own exercises, so a parent re-render walks the whole
// filtered catalog. ADR-0091's rule is that a memo boundary and stable props are one
// change — a `React.memo` on the section buys nothing while the handler it receives is a
// fresh arrow on every render, and the memo then *reads* as working.
//
// These tests hold both halves at once, because neither fails on its own: the boundary is
// a property of the section's export, and the stability is a property of what the screen
// hands it. They render the real TSX offline through `tsx-harness` (no browser, no build).

const CATALOG_URL = "http://localhost/exercises";

type CatalogComponent = (props: {
  initialFilters: { query: string; muscleGroups: string[]; equipment: string[]; difficulty: string[] };
  initialTaxonomy: CatalogTaxonomy;
  equipmentOptions: string[];
  myEquipment: string[];
  usage: never[];
  referenceIso: string;
  unit: string;
}) => React.JSX.Element;

// The props one pattern section is handed. Only their *identity* is under test, never
// their contents, so everything but the handler the tests invoke stays opaque.
type SectionProps = Record<string, unknown> & {
  onOpen: (exercise: ExerciseSearchResult) => void;
};

function entry(id: number, name: string, pattern: string): ExerciseSearchResult {
  return {
    id,
    name,
    targeted_muscles: ["quads"],
    required_equipment: ["barbell"],
    difficulty: 3,
    provenance: "curated",
    movement_pattern: pattern,
    equipment: ["barbell"],
  };
}

const TAXONOMY: CatalogTaxonomy = {
  total: 2,
  groups: [
    { pattern: "squat", count: 1, exercises: [entry(1, "Back Squat", "squat")] },
    { pattern: "hinge", count: 1, exercises: [entry(2, "Deadlift", "hinge")] },
  ],
};

// Mount the real catalog screen with its one server-action boundary stubbed and the
// pattern section replaced by a probe that records every render and the props it was
// handed. The probe is deliberately NOT memoized, so a re-rendering screen cannot hide
// behind a memo boundary the way the real section does.
async function mountCatalog(): Promise<{
  renders: SectionProps[];
  root: { unmount: () => void };
}> {
  const renders: SectionProps[] = [];
  const { ExerciseCatalogTaxonomy } = loadTsx<{
    ExerciseCatalogTaxonomy: CatalogComponent;
  }>("components/ExerciseCatalogTaxonomy.tsx", {
    "@/app/exercises/actions": {
      fetchCatalogTaxonomyForFilters: async () => ({ taxonomy: TAXONOMY, error: null }),
    },
    "@/app/exercises/catalog-detail-action": {
      fetchCatalogEntryDetail: async () => null,
    },
    "next/link": {
      __esModule: true,
      default: ({ children }: { children: React.ReactNode }) =>
        React.createElement("a", null, children),
    },
    "@/components/exercise/pattern-section": {
      PatternSection: (props: SectionProps) => {
        renders.push(props);
        return null;
      },
    },
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  await React.act(async () =>
    root.render(
      React.createElement(ExerciseCatalogTaxonomy, {
        initialFilters: { query: "", muscleGroups: [], equipment: [], difficulty: [] },
        initialTaxonomy: TAXONOMY,
        equipmentOptions: ["barbell", "dumbbell"],
        myEquipment: ["barbell"],
        usage: [],
        referenceIso: "2026-09-30",
        unit: "kg",
      }),
    ),
  );
  return { renders, root };
}

test("the pattern section is memoized, so an unchanged catalog skips its subtree", () => {
  // Arrange / Act — the export itself carries the memo boundary.
  const { PatternSection } = loadTsx<{ PatternSection: unknown }>(
    "components/exercise/pattern-section.tsx",
  );

  // Assert
  assert.equal(
    (PatternSection as { $$typeof?: symbol }).$$typeof,
    Symbol.for("react.memo"),
    "a nested list over the whole catalog only pays off behind React.memo",
  );
});

test("opening the details drawer leaves every pattern section prop identical", async () => {
  // Arrange — the catalog rendered, with its sections recorded.
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { renders, root } = await mountCatalog();
    const last = () => renders[renders.length - 1];
    assert.ok(renders.length > 0, "the catalog renders one section per movement pattern");
    const settled = last();
    const before = renders.length;

    // Act — open a row's detail drawer. That is pure screen state: the filtered catalog
    // behind the drawer does not change.
    await React.act(async () => settled.onOpen(TAXONOMY.groups[0].exercises[0]));

    // Assert — the screen re-rendered, and every prop kept its identity, so the memo
    // boundary on the section is not defeated by a fresh arrow or a fresh map.
    assert.ok(renders.length > before, "opening the drawer re-renders the screen");
    const after = last();
    for (const key of ["exercises", "usageMap", "onOpen", "referenceIso"]) {
      assert.equal(after[key], settled[key], `${key} must be stable across the re-render`);
    }

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("closing the details drawer leaves every pattern section prop identical", async () => {
  // Arrange — a drawer already open.
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { renders, root } = await mountCatalog();
    const last = () => renders[renders.length - 1];
    await React.act(async () => last().onOpen(TAXONOMY.groups[0].exercises[0]));
    const settled = last();
    const before = renders.length;

    // Act — dismiss it from the drawer's own close button.
    await React.act(async () =>
      document
        .querySelector<HTMLElement>('[aria-label="Close details"]')!
        .dispatchEvent(new window.Event("click", { bubbles: true })),
    );

    // Assert
    assert.ok(renders.length > before, "closing the drawer re-renders the screen");
    const after = last();
    for (const key of ["exercises", "usageMap", "onOpen", "referenceIso"]) {
      assert.equal(after[key], settled[key], `${key} must be stable across the re-render`);
    }

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});
