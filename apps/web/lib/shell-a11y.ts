// Canonical accessibility contract for the app shell (root layout + TabBar). This is the
// single source of truth for the skip-to-content target and the two <nav> landmark labels,
// kept out of the "use client"/server components so `shell-a11y.test.ts` can assert the
// contract without a browser (CLAUDE.md: frontend logic lives in `lib/` as a tested
// view-model, components stay thin — mirrors `tab-nav.ts`).
//
// The skip link's href and the <main> target id are derived from one another here so they
// can never silently drift apart: rename the id and the href follows, and the test fails
// closed if either is edited in isolation (finding #11).

// The id stamped on the shell's <main> element — the skip link's jump target.
export const MAIN_CONTENT_ID = "main";

// The skip link's href, always the fragment reference to MAIN_CONTENT_ID.
export const SKIP_LINK_HREF = `#${MAIN_CONTENT_ID}`;

// The visible text of the skip-to-content link.
export const SKIP_LINK_LABEL = "Skip to content";

// Distinct accessible labels for the shell's two <nav> landmarks, so a screen-reader
// landmark rotor announces "Account navigation" vs "Primary navigation" rather than two
// indistinguishable "navigation" entries. `account` labels the header (auth controls only);
// `primary` labels the bottom TabBar (the app's route switcher).
export const NAV_LABELS = {
  account: "Account",
  primary: "Primary",
} as const;
