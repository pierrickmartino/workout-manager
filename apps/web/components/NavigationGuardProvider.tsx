"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  resolveGuardedNavigation,
  type NavigationClickInfo,
} from "@/lib/navigation-guard";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";

// The generic copy for every guarded form (Q7 — one message, not per-form).
const DIALOG_TITLE = "Unsaved changes";
const DIALOG_MESSAGE =
  "You have unsaved changes on this page. Leave and discard them?";
const CONFIRM_LABEL = "Discard";
const CANCEL_LABEL = "Keep editing";

// The one behaviour the provider exposes to descendant forms: declare whether the
// current form has unsaved work. Registering `false` (or unmounting) stands the guard
// down. Stable across renders so the `useNavigationGuard` effect never re-fires on
// identity changes.
interface NavigationGuardContextValue {
  setDirty: (isDirty: boolean) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(
  null,
);

// Register a form's dirty state with the guard for as long as the form is mounted.
// Pass the form's coarse "has unsaved work" flag; the guard prompts before any in-app
// navigation or tab-close while it is true, and stands down on cleanup.
export function useNavigationGuard(isDirty: boolean): void {
  const context = useContext(NavigationGuardContext);
  if (context === null) {
    throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  }
  const { setDirty } = context;

  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);
}

// App-wide guard against losing unsaved form work by navigating away (finding #4,
// ADR-0012 keeps Live Session as the persistence exception; every other form is
// guarded, not persisted). Mounted once near the root so the two listeners are
// installed for the whole session:
//   - a capture-phase document click listener that catches in-app `<a>` navigations
//     (the always-mounted TabBar and header included) before the router acts, and
//     replaces them with a confirm dialog when a form is dirty;
//   - a `beforeunload` handler for refresh / tab-close (native prompt only).
// Browser back/forward is a documented best-effort gap — App Router exposes no
// reliable blocker and history patching is too fragile to be worth it.
// Successful submits redirect via a server action (not a click), so they bypass the
// click listener with no extra bookkeeping.
export function NavigationGuardProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  // The live dirty flag, held in a ref so the once-installed native listeners read the
  // current value without being re-bound on every dirty-state change.
  const dirtyRef = useRef(false);
  // The pending destination captured from an intercepted click; non-null renders the
  // dialog. Held in state because it drives the render.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const setDirty = useCallback((isDirty: boolean) => {
    dirtyRef.current = isDirty;
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current) return;

      const target = event.target;
      const anchorEl =
        target instanceof Element ? target.closest("a") : null;
      // Only treat it as a link when it actually carries an href — an href-less anchor
      // (a button-styled `<a>`) has an empty `.href` that `new URL` would throw on.
      const hasHref = anchorEl !== null && anchorEl.hasAttribute("href");

      const info: NavigationClickInfo = {
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        anchor:
          anchorEl !== null && hasHref
            ? {
                href: anchorEl.href,
                target: anchorEl.getAttribute("target"),
                download: anchorEl.hasAttribute("download"),
                origin: new URL(anchorEl.href).origin,
              }
            : null,
        currentOrigin: window.location.origin,
        currentUrl: window.location.href,
      };

      const destination = resolveGuardedNavigation(info);
      if (destination === null) return;

      // Claim the click before the router's own handler runs, then defer the decision
      // to the dialog.
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(destination);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      // The modern incantation for the browser's native "leave site?" prompt. The
      // message itself is not shown — browsers use their own wording.
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const confirmDiscard = useCallback(() => {
    const destination = pendingHref;
    setPendingHref(null);
    // The user chose to discard; stand the guard down so the programmatic push (not a
    // click) is not itself intercepted.
    dirtyRef.current = false;
    if (destination !== null) router.push(destination);
  }, [pendingHref, router]);

  const cancelDiscard = useCallback(() => setPendingHref(null), []);

  return (
    <NavigationGuardContext.Provider value={{ setDirty }}>
      {children}
      {pendingHref !== null ? (
        <ConfirmDialog
          title={DIALOG_TITLE}
          message={DIALOG_MESSAGE}
          confirmLabel={CONFIRM_LABEL}
          cancelLabel={CANCEL_LABEL}
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      ) : null}
    </NavigationGuardContext.Provider>
  );
}
