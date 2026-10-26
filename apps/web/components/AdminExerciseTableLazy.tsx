"use client";

import dynamic from "next/dynamic";

// `AdminExerciseTable` behind a dynamic import (#772, ADR-0088): the table exists only at the
// shell's wide width, so its module stays out of the catalog route's phone bundle. The browser
// mounts this only behind `useWideViewport`, because `next/dynamic` defers the fetch but does
// not cancel it. The gate reads narrow on the server, so the server render and hydration are
// the card list and a wide viewport swaps in the table right after; the rows are the ones the
// page already fetched, so the swap adds no request beyond this chunk.
export const AdminExerciseTableLazy = dynamic(() =>
  import("@/components/AdminExerciseTable").then((m) => m.AdminExerciseTable),
);
