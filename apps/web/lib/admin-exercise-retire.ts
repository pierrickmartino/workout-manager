// Pure logic for the admin Retire / un-Retire control (issue #506, ADR-0076). Frontend logic
// lives here per the repo rule so it is unit-testable with `node --test` and the component
// stays thin. No server or React imports.
//
// Retire is a reversible soft tombstone an admin sets to hide a junk, duplicate, or unsafe
// movement from every discovery / candidate surface while it stays fully resolvable by id. The
// act is a *separate* deliberate one with its own endpoint (never a side effect of the
// descriptive edit), and only an admin un-retires. This module owns the copy and the target
// state the control shows for either direction, so the component only wires state to handlers.

// The complete presentation of the Retire control for the Exercise's current tombstone state.
export interface RetireControlView {
  // Whether the Exercise is currently retired — drives the status line and which act shows.
  retired: boolean;
  // The status the editor shows: an active Exercise is discoverable; a retired one is hidden.
  statusLabel: string;
  // A one-line explanation of the current state and what the button will do.
  description: string;
  // The action button's resting label ("Retire" / "Un-retire") and its in-flight label.
  actionLabel: string;
  busyLabel: string;
  // The state the button moves the Exercise to (retire ⇒ true, un-retire ⇒ false). The server
  // action forwards this so one control drives both endpoints.
  nextRetired: boolean;
  // The success message shown after the act completes.
  successMessage: string;
}

const ACTIVE_DESCRIPTION =
  "This movement is discoverable across the catalog, search, facets, substitution, and " +
  "exercise detail. Retiring hides it from all of those while keeping it resolvable by id, so " +
  "nothing that already references it breaks.";

const RETIRED_DESCRIPTION =
  "This movement is retired: hidden from the catalog, search, facets, substitution, and " +
  "exercise detail, but still resolvable by id so existing plans and logs are untouched. " +
  "Un-retiring fully restores it to discovery.";

// Project the Exercise's retired flag onto the control's copy and target state (ADR-0076).
// Pure: it derives labels only and never mutates its input.
export function retireControlView(retired: boolean): RetireControlView {
  return retired
    ? {
        retired: true,
        statusLabel: "Retired",
        description: RETIRED_DESCRIPTION,
        actionLabel: "Un-retire",
        busyLabel: "Un-retiring…",
        nextRetired: false,
        successMessage: "Exercise un-retired — it is discoverable again.",
      }
    : {
        retired: false,
        statusLabel: "Active",
        description: ACTIVE_DESCRIPTION,
        actionLabel: "Retire",
        busyLabel: "Retiring…",
        nextRetired: true,
        successMessage: "Exercise retired — it is hidden from discovery.",
      };
}
