// Pure view-model for Home's persistent quick-action row (docs/redesign-ia.md, ADR-0071).
// NO I/O and NO server-only imports, so it is safe in both Server and Client Components and
// is unit-testable in isolation. It turns the aggregated Home read into the ordered launch
// shortcuts for the recurring core intents, resolving each href and dropping "Start next"
// when there is no Next Session to start (the empty state). Copy for each action lives in
// the component; this module holds only the stable keys, labels, and destinations.

import type { HomeData } from "./home-types";

// The stable identity of a quick action — used as a React key and to select its icon in the
// component. `start` is I1 (start the Next Session), `build` is I4 (author a plan to run
// later), `log` is I5 (record a past workout now), `sessions` is I6 (re-run from the library).
export type QuickActionKey = "start" | "build" | "log" | "sessions";

// One resolved quick action: its identity, its short button label, its destination href, and
// whether it is the row's primary emphasis (only "Start next" is, and only when present).
export interface QuickAction {
  key: QuickActionKey;
  label: string;
  href: string;
  primary: boolean;
}

// Derive the Home quick-action row from the aggregated Home read. "Start next" leads the row
// and deep-links to the Next Session's live route — satisfying the I1 ≤1-tap budget — but is
// omitted when there is no Current Protocol or it holds no Next Session (the empty state,
// where the generate launchpad covers starting something new). The three hand-made core
// intents are always offered so a self-managed user is never stranded.
export function quickActions(home: HomeData): QuickAction[] {
  const actions: QuickAction[] = [];

  const next = home.current_protocol?.next_session ?? null;
  if (next) {
    actions.push({
      key: "start",
      label: "Start next",
      href: `/sessions/${next.session_id}/live`,
      primary: true,
    });
  }

  actions.push({ key: "build", label: "Build", href: "/sessions/build", primary: false });
  actions.push({ key: "log", label: "Log", href: "/sessions/log", primary: false });
  actions.push({
    key: "sessions",
    label: "My sessions",
    href: "/sessions",
    primary: false,
  });

  return actions;
}
