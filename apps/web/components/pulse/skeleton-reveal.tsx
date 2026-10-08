import { ViewTransition } from "react";

// The loading-to-content reveal (ADR-0123). Wraps a skeleton — a route's `loading.tsx` or an
// in-page Suspense fallback — so that when its data resolves, the skeleton's snapshot fades off
// over the real content instead of vanishing. The content itself doesn't animate: the root is
// live (ADR-0120), so it is already painted underneath, and what the skeleton shares with it — a
// page header in the same place — fades over identical pixels and shows no dip.
//
// It must be the fallback's outermost element: a boundary below a DOM node that unmounts with
// it never fires exit. A plain class, not a type map, because a Suspense resolve is its own
// transition and carries no type. Exit only, and only on unmount: navigating away while the
// skeleton shows unmounts it with the route's boundary, which suppresses this one.
export function SkeletonReveal({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ViewTransition exit="skeleton-out" default="none">
      {children}
    </ViewTransition>
  );
}

// The gap a route's `<section className="flex flex-col gap-N">` puts between its header and its
// first block, reproduced as a top margin so the skeleton lays out exactly as the page will.
// Literal strings so Tailwind sees every class.
const DATA_REGION: Record<6 | 7 | 8, string> = {
  6: "mt-6 flex flex-col gap-6",
  7: "mt-7 flex flex-col gap-7",
  8: "mt-8 flex flex-col gap-8",
};

// A route's `loading.tsx` (ADR-0123). The header renders outside the reveal: it lands in the
// live root and is swapped instantly for the page's own header in the same place, so it never
// fades over itself. Only the data region below dissolves. The fragment root matters — the
// reveal's parent must outlive the fallback, or its exit would not fire.
export function SkeletonPage({
  header,
  gap,
  children,
}: {
  header: React.ReactNode;
  // The page's own `gap-N` between header and content.
  gap: 6 | 7 | 8;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      {header}
      <SkeletonReveal>
        <div className={DATA_REGION[gap]}>{children}</div>
      </SkeletonReveal>
    </>
  );
}
