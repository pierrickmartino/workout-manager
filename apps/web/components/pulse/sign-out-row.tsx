"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { purgeLocalLiveState } from "@/lib/live-session-storage";

// An explicit log-out control for the Profile view (F5 Slice 1). Styled to match
// `NavRow` — an icon tile, a body label, a chevron-less trailing affordance — but
// rendered as a button that surfaces Clerk's `signOut` rather than a navigation link.
// Signing out returns the operator to the app root.
export function SignOutRow(): React.JSX.Element {
  const { signOut } = useClerk();

  // Purge every user-scoped local live store *before* Clerk signs out (ADR-0059), so a
  // shared browser profile never hands the next signed-in account this account's live
  // slot. The purge is synchronous `localStorage` teardown, so it completes before the
  // async `signOut()` redirect.
  function handleSignOut(): void {
    purgeLocalLiveState();
    void signOut({ redirectUrl: "/" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-elevated/50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-magenta-dim text-magenta">
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="flex-1 font-sans text-[15px] font-medium text-text-primary">
        Log out
      </span>
    </button>
  );
}
