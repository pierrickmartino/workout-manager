import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom, setFieldValue } from "./tsx-harness.ts";
import * as viewModel from "./admin-exercises-view.ts";
import type { AdminExerciseRow } from "./admin-exercises-view.ts";

// ADR-0097: the admin catalog browser holds the whole Catalog — one generous page, up to 500
// rows — and refilters it on every keystroke. Two of the three things that keep that off the
// keystroke path are properties of this component rather than of a view-model, so they are
// held by mounting it: that the sort happens once per catalog and not once per character, and
// that every row defers its own layout and paint.
//
// The third, `useDeferredValue`, is not mechanized here and deliberately so: `act()` flushes
// the urgent and the deferred pass together, so the only thing a test can see is the settled
// result. What it *can* check is that deferring never desynchronizes the screen — the field,
// the rows and the summary line must all describe the same filter pass once it settles.

const CATALOG_URL = "http://localhost/admin/exercises";

type BrowserComponent = (props: { rows: AdminExerciseRow[] }) => React.JSX.Element;

function row(id: number, name: string, provenance = "curated"): AdminExerciseRow {
  return { id, name, provenance, completeness: "enriched", retired: false };
}

const ROWS: AdminExerciseRow[] = [
  row(1, "Back Squat"),
  row(2, "Front Squat"),
  row(3, "Overhead Press", "ai_generated"),
  row(4, "Barbell Row"),
];

// Mount the real browser with the catalog view-model wrapped in a counting proxy, so a test
// can see how often the sort actually runs. `next/link` is replaced because the component
// renders one per row and the Next runtime is not here.
async function mountBrowser(): Promise<{
  sortCalls: () => number;
  root: { unmount: () => void };
}> {
  let sorts = 0;
  const { AdminExerciseBrowser } = loadTsx<{ AdminExerciseBrowser: BrowserComponent }>(
    "components/AdminExerciseBrowser.tsx",
    {
      "@/lib/admin-exercises-view": {
        ...viewModel,
        sortAdminExercises: (rows: readonly AdminExerciseRow[]) => {
          sorts += 1;
          return viewModel.sortAdminExercises(rows);
        },
      },
      // The component seeds its filters from the URL (#7). The real hook needs the App
      // Router runtime, so it reads the mounted document's own query string here.
      //
      // `useRouter` throws rather than returning a stub: the mirror must be a
      // `replaceState`, and a router push would re-run the Server Component and re-fetch the
      // whole catalog on every keystroke. Reaching for the router at all fails the mount.
      "next/navigation": {
        useSearchParams: () => new URLSearchParams(window.location.search),
        useRouter: () => {
          throw new Error("the filter mirror is a replaceState, never a navigation");
        },
      },
      "next/link": {
        __esModule: true,
        default: ({ children, href, className }: {
          children: React.ReactNode;
          href: string;
          className?: string;
        }) => React.createElement("a", { href, className }, children),
      },
    },
  );
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  await React.act(async () =>
    root.render(React.createElement(AdminExerciseBrowser, { rows: ROWS })),
  );
  return { sortCalls: () => sorts, root };
}

function searchField(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="search"]')!;
}

function rowNames(): string[] {
  return [...document.querySelectorAll('a[href^="/admin/exercises/"]')].map(
    (link) => link.querySelector("span")!.textContent ?? "",
  );
}

test("the catalog is sorted once, however many characters are typed", async () => {
  // Arrange
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { sortCalls, root } = await mountBrowser();
    const afterMount = sortCalls();
    assert.equal(afterMount, 1, "the catalog is sorted on mount");

    // Act — four keystrokes, each of which refilters the whole catalog.
    for (const typed of ["s", "sq", "squ", "squa"]) {
      await React.act(async () => setFieldValue(searchField(), typed));
    }

    // Assert — the order never depends on the filters, so none of those passes re-sorted.
    // 500 `localeCompare`s per character is what this hoist exists to not pay.
    assert.equal(sortCalls(), afterMount);

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("the field, the rows and the summary all describe the same filter pass", async () => {
  // Arrange
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { root } = await mountBrowser();
    assert.deepEqual(rowNames(), ["Back Squat", "Barbell Row", "Front Squat", "Overhead Press"]);

    // Act
    await React.act(async () => setFieldValue(searchField(), "squat"));

    // Assert — a deferred list that settled behind its own input would show one of these
    // three disagreeing with the other two.
    assert.equal(searchField().value, "squat");
    assert.deepEqual(rowNames(), ["Back Squat", "Front Squat"]);
    assert.equal(document.body.textContent?.includes("2 of 4"), true, document.body.textContent ?? "");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("clearing the filters restores the whole catalog", async () => {
  // Arrange
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { root } = await mountBrowser();
    await React.act(async () => setFieldValue(searchField(), "squat"));

    // Act — the affordance only exists while a filter is active, which is itself read off the
    // settled pass, so finding it is part of the assertion.
    const clear = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear filters",
    )!;
    await React.act(async () => clear.dispatchEvent(new window.Event("click", { bubbles: true })));

    // Assert
    assert.equal(searchField().value, "");
    assert.equal(rowNames().length, ROWS.length);

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("every catalog row defers its own layout and paint", async () => {
  // Arrange
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { root } = await mountBrowser();

    // Act
    const links = [...document.querySelectorAll('a[href^="/admin/exercises/"]')];

    // Assert — the one class that makes an unvirtualized 500-row list cost what the dozen
    // rows on screen cost (`app/globals.css`). A row that lost it would still look right.
    assert.equal(links.length, ROWS.length);
    for (const link of links) {
      assert.ok(
        link.className.split(/\s+/).includes("list-row-defer"),
        `row is missing list-row-defer: ${link.className}`,
      );
    }

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

// #7: the filter state is the catalog's address. These hold the two halves a view-model
// cannot — that the component seeds itself from the URL it was opened at, and that it writes
// the URL back as the admin filters, without a navigation that would re-run the page.

test("the browser opens filtered when the URL says so", async () => {
  // Arrange — a shared or bookmarked link into the narrowed catalog.
  const { restore } = mountDom({ url: `${CATALOG_URL}?q=squat&provenance=curated` });
  try {
    // Act
    const { root } = await mountBrowser();

    // Assert — the field, the facet and the rows all show the shared view, not the whole
    // catalog with a stale address above it.
    assert.equal(searchField().value, "squat");
    assert.deepEqual(rowNames(), ["Back Squat", "Front Squat"]);
    const provenance = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by provenance"]',
    )!;
    assert.equal(provenance.value, "curated");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("a facet the catalog's vocabulary does not contain is ignored, not applied", async () => {
  // Arrange — a hand-mangled URL. Honouring it would show an empty catalog under a dropdown
  // reading "All provenance".
  const { restore } = mountDom({ url: `${CATALOG_URL}?provenance=marketing` });
  try {
    // Act
    const { root } = await mountBrowser();

    // Assert
    assert.equal(rowNames().length, ROWS.length);

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("typing mirrors the filters into the URL without a navigation", async () => {
  // Arrange — a router push would re-run the Server Component and re-fetch 500 rows per
  // keystroke, so the mirror is a `replaceState`: the document never changes.
  const { restore } = mountDom({ url: CATALOG_URL });
  try {
    const { root } = await mountBrowser();

    // Act
    await React.act(async () => setFieldValue(searchField(), "squat"));

    // Assert
    assert.equal(window.location.search, "?q=squat");
    assert.equal(window.location.pathname, "/admin/exercises");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("clearing the filters leaves a bare URL behind", async () => {
  // Arrange
  const { restore } = mountDom({ url: `${CATALOG_URL}?q=squat` });
  try {
    const { root } = await mountBrowser();

    // Act
    const clear = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear filters",
    )!;
    await React.act(async () => clear.dispatchEvent(new window.Event("click", { bubbles: true })));

    // Assert — no `?q=` left dangling, so the cleared catalog shares as the whole catalog.
    assert.equal(window.location.search, "");
    assert.equal(window.location.pathname, "/admin/exercises");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});
