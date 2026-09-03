// The Note display view-model (ADR-0065, #451): what the plan and record views show for an
// Exercise Note (a plan-side coaching cue) and a Set Note (a record-side remark).
//
// Notes are user-authored free text that the backend **HTML-escapes at the write boundary**
// (`app.domain.note.parse_note`, the nonce-CSP DOM-XSS posture of ADR-0036), so the stored
// value is inert wherever it lands. This module owns the two rules the views share:
//   * an **absent** note (null / undefined / blank) renders as **nothing** — no empty row; and
//   * a present note is **decoded** back to the text the user typed for display. Decoding is the
//     exact inverse of the backend's `html.escape(quote=True)`, so `a &amp; b` reads as `a & b`
//     instead of showing the raw entity. This stays injection-proof: React renders the decoded
//     string as a text node (re-escaping it for the DOM), so no markup can execute — the stored
//     value is escaped for defense-in-depth, and this only undoes the escaping for display.
//
// No server-only imports, so it is safe in both Server and Client Components and unit-testable
// without a browser. Keeping the "show it, and as what text" decision here keeps components thin.

import type { ExercisePrescription } from "./sessions-types.ts";
import type { LoggedSet } from "./logs-types.ts";

// The five entities the backend's `html.escape(quote=True)` produces, mapped back to their
// characters. `&amp;` is applied **last** so an already-decoded `&` is never re-consumed — the
// exact inverse of the escape, which replaces `&` first.
function decodeNoteEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

// The display text for a stored note, or `null` when there is nothing to show. A null,
// undefined, or blank/whitespace-only value is "no note" and returns `null` — the signal to
// render nothing. A present note is decoded from its stored (escaped) form to the text the user
// typed. This is the single rule the plan and record note views share.
export function noteText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const decoded = decodeNoteEntities(value).trim();
  return decoded === "" ? null : decoded;
}

// The display text for one Exercise Prescription's plan-side Exercise Note, or `null` when the
// movement carries no cue (render nothing).
export function exerciseNoteText(
  prescription: Pick<ExercisePrescription, "note">,
): string | null {
  return noteText(prescription.note);
}

// The display text for one Logged Set's record-side Set Note, or `null` when the set carries no
// remark (render nothing).
export function setNoteText(loggedSet: Pick<LoggedSet, "note">): string | null {
  return noteText(loggedSet.note);
}
