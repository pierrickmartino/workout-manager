"use client";

import { useSyncExternalStore } from "react";

import { createSharedStore } from "./shared-store";
import { WIDE_VIEWPORT_QUERY } from "./wide-viewport";

// Whether the viewport is at the shell's wide width (ADR-0088), for the one job CSS cannot do:
// deciding whether to *mount* a component at all. `hidden lg:flex` hides a subtree but still
// renders and hydrates it, which is how 110 KB gzipped of chart library ended up in the mobile
// Dashboard bundle (#576 review). Hiding is not the same as not shipping.
//
// The server has no viewport, so server rendering and hydration read `false`: a guess would be
// a hydration mismatch, and a wide viewport then mounts the gated subtree right after hydrating.
// A component mounted later (a client navigation) reads the real width on its first render. One
// shared `matchMedia` listener serves every reader.
const wideViewport = createSharedStore<boolean>({
  read: () => mediaQuery()?.matches ?? false,
  watch: (onChange) => {
    const query = mediaQuery();
    if (!query) return () => {};
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  },
});

// `matchMedia` is absent in some non-browser environments the PWA's tooling renders in.
function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(WIDE_VIEWPORT_QUERY);
}

function serverSnapshot(): boolean {
  return false;
}

export function useWideViewport(): boolean {
  return useSyncExternalStore(
    wideViewport.subscribe,
    wideViewport.getSnapshot,
    serverSnapshot,
  );
}
