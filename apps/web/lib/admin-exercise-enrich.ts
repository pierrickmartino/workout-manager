// Pure copy for the admin per-Exercise "enrich now" control (issue #508, ADR-0041). Frontend
// logic lives here per the repo rule so it is unit-testable with `node --test` and the component
// stays thin. No server or React imports.
//
// Enrich-now hands one catalog movement to the same out-of-band Enrichment worker the create
// flow uses (issue #309): no AI runs on the request, the backend only accepts the job (202) and
// a worker fills the movement's description, muscles, and steps later. It is safe to re-run — a
// movement already at or above the Listable bar costs no AI call — and it never touches
// Provenance, precautions, the image, or the emphasis split. This module owns the button copy
// and the "job accepted" acknowledgement the control shows, so the component only wires state
// to the handler.

// The complete presentation of the enrich-now control.
export interface EnrichControlView {
  // A one-line explanation of what the action does and its idempotent-friendly guarantee.
  description: string;
  // The action button's resting label and its in-flight label.
  actionLabel: string;
  busyLabel: string;
  // The acknowledgement shown once the backend has accepted the job (202). It deliberately
  // reflects acceptance, not completion — the fill runs in the background.
  acceptedMessage: string;
}

const DESCRIPTION =
  "Queue enrichment for this movement now — a background worker fills its description, " +
  "targeted muscles, and execution steps. No AI runs on this request. Safe to re-run: a " +
  "movement already enriched costs no AI call, and provenance is never changed.";

// The one static view of the enrich-now control. A function (not a bare constant) to mirror its
// `retireControlView` / delete-view siblings and leave room for future state without churn.
export function enrichControlView(): EnrichControlView {
  return {
    description: DESCRIPTION,
    actionLabel: "Enrich now",
    busyLabel: "Queuing…",
    acceptedMessage:
      "Enrichment queued — the movement's fields will be filled in the background shortly.",
  };
}
