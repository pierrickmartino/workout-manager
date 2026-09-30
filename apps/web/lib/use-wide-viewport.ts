"use client";

import { useEffect, useState } from "react";

import { WIDE_VIEWPORT_QUERY } from "./wide-viewport";

// Whether the viewport is at the shell's wide width (ADR-0088), for the one job CSS cannot do:
// deciding whether to *mount* a component at all. `hidden lg:flex` hides a subtree but still
// renders and hydrates it, which is how 110 KB gzipped of chart library ended up in the mobile
// Dashboard bundle (#576 review). Hiding is not the same as not shipping.
//
// Starts `false` and resolves on mount, because the server has no viewport: returning a guess
// during render would be a hydration mismatch. So a wide viewport mounts the gated subtree one
// frame late, which is the right trade for a secondary block — and a narrow one never mounts it.
export function useWideViewport(): boolean {
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    // `matchMedia` is absent in some non-browser environments the PWA's tooling renders in.
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(WIDE_VIEWPORT_QUERY);
    setIsWide(query.matches);
    const onChange = (event: MediaQueryListEvent) => setIsWide(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isWide;
}
