"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button, textarea, input, select, [tabindex]';

// Isolate siblings at every ancestor level, including the global app chrome,
// while keeping the dialog's ancestors usable and the backdrop clickable.
function isolateBackground(surface: HTMLElement) {
  const changed: HTMLElement[] = [];
  let branch: HTMLElement = surface;
  while (branch.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      changed.push(sibling);
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  return () => changed.forEach((element) => element.removeAttribute("inert"));
}

export function useModalFocus(
  dialogRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  surfaceRef?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const opener = document.activeElement;
    const restoreBackground = isolateBackground(surfaceRef?.current ?? dialog);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.focus();
    const containFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) dialog.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) =>
        element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert], [hidden], [aria-hidden='true']") &&
        window.getComputedStyle(element).display !== "none" && window.getComputedStyle(element).visibility !== "hidden",
      );
      const first = controls[0] ?? dialog;
      const last = controls.at(-1) ?? dialog;
      const active = document.activeElement;
      if (!controls.length || (event.shiftKey ? active === first || active === dialog : active === last || active === dialog) || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("focusin", containFocus);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.removeEventListener("keydown", onKey);
      restoreBackground();
      document.body.style.overflow = overflow;
      if ((opener instanceof HTMLElement || opener instanceof window.SVGElement) && opener.isConnected) opener.focus();
    };
  }, [dialogRef, open, surfaceRef]);
}
