import type { CSSProperties } from "react";

// The shell chrome that stays on screen across a navigation (view-transitions audit §8).
// A view transition snapshots the page as one `root` image and animates it, so without a
// name of its own the header, tab bar, sidebar and sync toast would slide with the page.
// Each one is pinned by a hand-written `view-transition-name`, and `app/globals.css`
// freezes that name's group at a z-index tier (ADR-0119).
//
// This module is the one place such a name is written. Components import it, so it stays
// free of anything heavier than a type; `persistent-transition-policy.ts` checks the
// stylesheet and the call sites against it.

// `chrome` sits above the page; `overlay` sits above the chrome, so a toast never slides
// behind the tab bar it floats over.
export type PersistentTier = "chrome" | "overlay";

export const TIER_Z_INDEX: Readonly<Record<PersistentTier, number>> = {
  chrome: 100,
  overlay: 200,
};

export interface PersistentElement {
  readonly name: string;
  // A `backdrop-filter` is baked into the snapshot, where it no longer blurs what moves
  // behind it. Such an element drops its old snapshot and shows its live new one.
  readonly hasBackdrop: boolean;
  readonly tier: PersistentTier;
}

export const PERSISTENT_ELEMENTS = {
  header: { name: "shell-header", hasBackdrop: true, tier: "chrome" },
  tabBar: { name: "shell-tab-bar", hasBackdrop: true, tier: "chrome" },
  sidebar: { name: "shell-sidebar", hasBackdrop: false, tier: "chrome" },
  syncToast: { name: "shell-sync-toast", hasBackdrop: true, tier: "overlay" },
} as const satisfies Record<string, PersistentElement>;

export type PersistentElementKey = keyof typeof PERSISTENT_ELEMENTS;

export function persistentTransitionStyle(key: PersistentElementKey): CSSProperties {
  return { viewTransitionName: PERSISTENT_ELEMENTS[key].name };
}
