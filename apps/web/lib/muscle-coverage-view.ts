import type { GroupCoverage, RecentCoverage } from "./analytics-types.ts";

// One Muscle Group's checklist row: the display `group`, the `covered` boolean the
// renderer picks an icon from, a `stateLabel` ("Trained" / "Not trained") so the state
// is legible as text and not color alone, and an `ariaLabel` naming the group, state, and
// window for a screen reader. Descriptive only — presence, never a verdict (ADR-0025).
export interface CoverageRow {
  group: string;
  covered: boolean;
  stateLabel: string;
  ariaLabel: string;
}

// The Muscle Group Coverage view: the labeled `weeksLabel` ("last 8 weeks"), the six group
// `rows` in the server's canonical order, a section-level `isEmpty` that is true only when
// no group has been trained in the window — the honest signal for the screen to show a
// single teaching empty state instead of a wall of six "not trained" rows (ADR-0025) — and
// a `footnote` that is the neutral disclosure string only when in-window work fell outside
// the six real groups, otherwise `null`. `isEmpty` and `footnote` are independent: a history
// of only unmapped work reads as six not-trained rows *and* carries the footnote.
export interface CoverageView {
  weeksLabel: string;
  rows: CoverageRow[];
  isEmpty: boolean;
  footnote: string | null;
}

const TRAINED_LABEL = "Trained";
const NOT_TRAINED_LABEL = "Not trained";

// The neutral, non-prescriptive disclosure copy (issue #189 / ADR-0025): it names that some
// recent work rolls up outside the six real groups without ranking, flagging, or nudging —
// no "low", no "train X". Shown only when the read model's `unclassified_present` is set.
const UNCLASSIFIED_FOOTNOTE = "Some recent sets list muscles we don't map yet.";

// Turn the API's six-group coverage read model into checklist rows, preserving the server's
// canonical group order (the view never reshuffles it). Each row's `ariaLabel` names the
// group, its state, and the window so the checklist is screen-reader legible without leaning
// on the icon or its color. `isEmpty` is true only when nothing was trained, so a user with
// no recent history sees one teaching empty state, not six not-trained rows. Pure and
// server-free, so it is safe from either a Server or Client Component.
export function toCoverageView(coverage: RecentCoverage): CoverageView {
  const weeksLabel = `last ${coverage.weeks} weeks`;
  const rows = coverage.groups.map((group) => toRow(group, weeksLabel));
  return {
    weeksLabel,
    rows,
    // The teaching empty state is for a genuinely empty window — never for one that holds
    // work rolling up outside the six. A history of only unmapped work reads as six
    // honest "not trained" rows plus the footnote (issue #189), not "no training logged
    // yet", which would be a lie for someone who did log — just in a modality we don't map.
    isEmpty:
      rows.every((row) => !row.covered) && !coverage.unclassified_present,
    footnote: coverage.unclassified_present ? UNCLASSIFIED_FOOTNOTE : null,
  };
}

function toRow(group: GroupCoverage, weeksLabel: string): CoverageRow {
  const stateLabel = group.covered ? TRAINED_LABEL : NOT_TRAINED_LABEL;
  const state = group.covered ? "trained" : "not trained";
  return {
    group: group.group,
    covered: group.covered,
    stateLabel,
    ariaLabel: `${group.group}: ${state} in the ${weeksLabel}`,
  };
}
