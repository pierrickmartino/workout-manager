// Pure view-model for the admin home dashboard (spec #767, ADR-0142): it turns the reads the
// admin home already makes into groups of summary tiles. Every number is a read-time projection
// over data that already exists (ADR-0018/0019) — nothing here is stored or counted on write.
// No server or React imports, so it is unit-testable with `node --test`.
//
// The dashboard is a list of tile **groups**, each with its own `ready` / `empty` / `failed`
// state, so one failed read darkens only its own group (per-group failure isolation): the
// catalog group (#768) and the AI group over the Generation Call log's window (#769), each
// built from its own reads alone. The AI summary also feeds the calls-by-Generator-Kind
// breakdown the Operations column lists.

import {
  summarizeCompletenessBreakdown,
  type CompletenessBreakdown,
} from "./catalog-completeness-breakdown-view.ts";
import { ADMIN_CATALOG_PATH } from "./admin-paths.ts";
import {
  adminFiltersToQuery,
  EMPTY_ADMIN_FILTERS,
  NO_VALUE,
  type AdminExerciseFilters,
} from "./admin-exercises-view.ts";
import {
  generatorKindLabel,
  latencyLabel,
  type GenerationOutcome,
  type GeneratorKind,
} from "./admin-generation-calls-view.ts";
import { auditLogHref, type AuditLogFilters } from "./admin-generation-calls-query.ts";

// One read as the page hands it over: the backend envelope's shape, structurally (naming
// `Envelope` would drag the server-only transport into this module). A read that rejected
// outright (a transport failure) arrives as `rejectedRead()`, so it carries a reason too.
export interface DashboardRead<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error?: string | null;
}

// A paginated read, whose `meta.total` is the exact match count across every page.
export interface DashboardPageRead extends DashboardRead<readonly unknown[]> {
  readonly meta?: { readonly total: number };
}

// Why a read that rejected (rather than returned an envelope) failed: `apiGet` rejects only
// when the request or its JSON never arrived. The data module logs the error itself.
const UNREACHABLE_REASON = "the API could not be reached";

// Why a read that succeeded without its payload failed (and the backend gave no reason).
const NO_DATA_REASON = "the response carried no data";

// The failed read a rejection becomes, so every group input is an envelope with a reason.
export function rejectedRead(): DashboardRead<never> {
  return { success: false, data: null, error: UNREACHABLE_REASON };
}

// One tile: a single link whose accessible name is its label and value. `footnote` qualifies
// the value (e.g. a total that is only a floor) and is absent when there is nothing to say.
export interface DashboardTileView {
  key: string;
  label: string;
  value: string;
  footnote?: string;
  href: string;
}

export type DashboardGroupKey = "catalog" | "ai";

// Each group's heading and what its failed message calls it ("Could not load the AI summary").
// The catalog heading says "health" so it never duplicates the CATALOG section's nav row.
const GROUPS: Readonly<Record<DashboardGroupKey, { title: string; noun: string }>> = {
  catalog: { title: "Catalog health", noun: "catalog" },
  ai: { title: "AI usage", noun: "AI" },
};

// `GET /api/admin/generation-calls/summary` (ADR-0142): read-time totals over the retention
// window. The token sums cover only calls that reported usage; `unreported_usage_calls`
// counts the rest. `median_latency_ms` spans successes and errors, `null` on an empty window.
export interface GenerationCallWindowSummary {
  total_calls: number;
  by_outcome: Record<GenerationOutcome, number>;
  by_generator_kind: Record<GeneratorKind, number>;
  input_tokens: number;
  output_tokens: number;
  unreported_usage_calls: number;
  median_latency_ms: number | null;
  window_days: number;
}

// One row of the calls-by-Generator-Kind list: a single link into the audit log filtered to
// that kind, named by its label and count.
export interface GeneratorKindCountView {
  kind: string;
  label: string;
  count: string;
  href: string;
}

// A group's three states. `empty` still carries its tiles — each reading "—" and still a link
// — so the row keeps its shape; `failed` carries only the message for an inline `Alert`.
export type DashboardGroupView =
  | { key: DashboardGroupKey; title: string; state: "ready"; tiles: DashboardTileView[] }
  | {
      key: DashboardGroupKey;
      title: string;
      state: "empty";
      tiles: DashboardTileView[];
      message: string;
    }
  | { key: DashboardGroupKey; title: string; state: "failed"; message: string };

// `retired` is the retired-filtered catalog page read for its `meta.total` alone (one row), so
// the Retired tile is exact however large the catalog grows.
export interface AdminDashboardInputs {
  completeness: DashboardRead<CompletenessBreakdown>;
  retired: DashboardPageRead;
  generationCalls: DashboardRead<GenerationCallWindowSummary>;
}

export interface AdminDashboardView {
  groups: DashboardGroupView[];
  // `null` when the summary could not be read: the AI group's inline error already says so.
  generatorKinds: GeneratorKindCountView[] | null;
}

// The catalog URL for a filter state, through the catalog's own serializer (ADR-0100), so a
// tile's link is exactly the URL the catalog would write for that filter.
function catalogHref(filters: Partial<AdminExerciseFilters> = {}): string {
  const query = adminFiltersToQuery({ ...EMPTY_ADMIN_FILTERS, ...filters }).toString();
  return query === "" ? ADMIN_CATALOG_PATH : `${ADMIN_CATALOG_PATH}?${query}`;
}

// A tile in a group with no data to summarize shows `NO_VALUE`: a dash, never a 0 that reads
// as a measured result (an empty catalog is not "0% Enriched").

const EMPTY_CATALOG_MESSAGE = "The catalog has no Exercises yet, so there is nothing to summarize.";

interface CatalogFigures {
  total: string;
  enriched: string;
  stub: string;
  retired: string;
}

// The four catalog tiles, in reading order, for a given set of formatted figures. The links
// are the same whatever the figures, so an empty group's tiles still lead into the catalog.
function catalogTiles(figures: CatalogFigures): DashboardTileView[] {
  return [
    { key: "total", label: "Total Exercises", value: figures.total, href: catalogHref() },
    { key: "enriched", label: "% Enriched", value: figures.enriched, href: catalogHref() },
    {
      key: "stub",
      label: "Stubs",
      value: figures.stub,
      href: catalogHref({ completeness: "stub" }),
    },
    {
      key: "retired",
      label: "Retired",
      value: figures.retired,
      href: catalogHref({ status: "retired" }),
    },
  ];
}

function catalogGroup(completeness: CompletenessBreakdown, retired: number): DashboardGroupView {
  // % Enriched is the completeness readout's own share, not a second calculation of it.
  const summary = summarizeCompletenessBreakdown(completeness);
  if (summary.isEmpty) {
    return {
      key: "catalog",
      title: GROUPS.catalog.title,
      state: "empty",
      tiles: catalogTiles({ total: NO_VALUE, enriched: NO_VALUE, stub: NO_VALUE, retired: NO_VALUE }),
      message: EMPTY_CATALOG_MESSAGE,
    };
  }
  return {
    key: "catalog",
    title: GROUPS.catalog.title,
    state: "ready",
    tiles: catalogTiles({
      total: String(summary.total),
      enriched: `${summary.enrichedPercent}%`,
      stub: String(completeness.stub),
      retired: String(retired),
    }),
  };
}

// A read's payload, or the reason it could not be read. A refused envelope and a successful
// envelope with no payload both mean "could not read this" — the same shapes
// `best-effort-read.ts` funnels — so both fail the group, with the backend's reason when it
// gave one. (A rejection already arrived as `rejectedRead()`.)
type ReadOutcome<T> = { ok: true; data: T } | { ok: false; reason: string };

function readOutcome<T>(read: DashboardRead<T>): ReadOutcome<T> {
  if (read.success && read.data != null) return { ok: true, data: read.data };
  return { ok: false, reason: read.error ?? NO_DATA_REASON };
}

// A paginated read's exact total; a page without one cannot be counted, so it fails too.
function totalOutcome(read: DashboardPageRead): ReadOutcome<number> {
  const page = readOutcome(read);
  if (!page.ok) return page;
  return read.meta ? { ok: true, data: read.meta.total } : { ok: false, reason: NO_DATA_REASON };
}

function failedGroup(key: DashboardGroupKey, reason: string): DashboardGroupView {
  const { title, noun } = GROUPS[key];
  return { key, title, state: "failed", message: `Could not load the ${noun} summary: ${reason}` };
}

// The catalog group from its two reads. Either read failing fails the whole group — a Retired
// count beside a missing breakdown would be a half-truth — but never another group.
function catalogGroupFromReads(inputs: AdminDashboardInputs): DashboardGroupView {
  const completeness = readOutcome(inputs.completeness);
  if (!completeness.ok) return failedGroup("catalog", completeness.reason);
  const retired = totalOutcome(inputs.retired);
  if (!retired.ok) return failedGroup("catalog", retired.reason);
  return catalogGroup(completeness.data, retired.data);
}

// --- AI group (#769) ---------------------------------------------------------------------

// The audit log URL for a filter state, through the log's own serializer (ADR-0100).
function auditLogFilteredHref(filters: Partial<AuditLogFilters> = {}): string {
  return auditLogHref({
    filters: { generatorKind: null, outcome: null, userId: null, ...filters },
    page: 1,
  });
}

// A fixed locale, so the server and the reader agree; compact, so "1.2M" fits a tile.
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

// A share as a percentage to one decimal at most: "25%", "33.3%", and "0.1%" rather than a
// rounded-away "0%" when one call in a thousand failed.
function percentLabel(part: number, whole: number): string {
  return `${Number(((part / whole) * 100).toFixed(1))}%`;
}

interface AiFigures {
  calls: string;
  errorRate: string;
  tokens: string;
  latency: string;
}

type AiFootnotes = Partial<Record<"calls" | "tokens", string>>;

// The four AI tiles, in reading order. Error rate is the one that is a filter; the rest lead to
// the whole log. The links do not depend on the figures, so an empty group still links.
function aiTiles(figures: AiFigures, footnotes: AiFootnotes = {}): DashboardTileView[] {
  const withFootnote = (tile: DashboardTileView, footnote?: string): DashboardTileView =>
    footnote ? { ...tile, footnote } : tile;
  return [
    withFootnote(
      { key: "calls", label: "Calls", value: figures.calls, href: auditLogFilteredHref() },
      footnotes.calls,
    ),
    {
      key: "error-rate",
      label: "Error rate",
      value: figures.errorRate,
      href: auditLogFilteredHref({ outcome: "error" }),
    },
    withFootnote(
      { key: "tokens", label: "Tokens", value: figures.tokens, href: auditLogFilteredHref() },
      footnotes.tokens,
    ),
    { key: "latency", label: "Median latency", value: figures.latency, href: auditLogFilteredHref() },
  ];
}

// The Tokens tile shows the in + out total, which fits a tile at any size; the footnote splits
// it and, since the sums skip calls with no reported usage (a floor), says by how many.
function tokensFootnote(summary: GenerationCallWindowSummary): string {
  const split = `${COMPACT.format(summary.input_tokens)} in · ${COMPACT.format(summary.output_tokens)} out`;
  const unreported = summary.unreported_usage_calls;
  return unreported > 0 ? `${split} · ${unreported} unreported` : split;
}

function aiGroup(summary: GenerationCallWindowSummary): DashboardGroupView {
  const days = `${summary.window_days} days`;
  if (summary.total_calls === 0 || summary.median_latency_ms === null) {
    // No calls: a 0% error rate would read as a measured result, so every tile is a dash.
    return {
      key: "ai",
      title: GROUPS.ai.title,
      state: "empty",
      tiles: aiTiles({ calls: NO_VALUE, errorRate: NO_VALUE, tokens: NO_VALUE, latency: NO_VALUE }),
      message: `No Generation Calls in the last ${days}, so there is nothing to summarize.`,
    };
  }
  const errors = summary.by_outcome.error ?? 0;
  return {
    key: "ai",
    title: GROUPS.ai.title,
    state: "ready",
    tiles: aiTiles(
      {
        calls: String(summary.total_calls),
        errorRate: percentLabel(errors, summary.total_calls),
        tokens: COMPACT.format(summary.input_tokens + summary.output_tokens),
        latency: latencyLabel(summary.median_latency_ms),
      },
      {
        calls: `Last ${days}`,
        tokens: tokensFootnote(summary),
      },
    ),
  };
}

function aiGroupFromRead(read: AdminDashboardInputs["generationCalls"]): DashboardGroupView {
  const summary = readOutcome(read);
  return summary.ok ? aiGroup(summary.data) : failedGroup("ai", summary.reason);
}

// Calls per Generator Kind, in the backend's (enum) order. A count, unlike a rate, is honest at
// zero, so an empty window lists every kind at 0. An unknown kind keeps its raw value as label.
function generatorKindCounts(
  read: AdminDashboardInputs["generationCalls"],
): GeneratorKindCountView[] | null {
  const summary = readOutcome(read);
  if (!summary.ok) return null;
  return Object.entries(summary.data.by_generator_kind).map(([kind, count]) => ({
    kind,
    label: generatorKindLabel(kind),
    count: String(count),
    href: auditLogFilteredHref({ generatorKind: kind }),
  }));
}

// The whole dashboard. Each group is built from its own reads alone, which is what keeps a
// failure in one group from reaching another; a new group is one more entry here.
export function adminDashboardView(inputs: AdminDashboardInputs): AdminDashboardView {
  return {
    groups: [catalogGroupFromReads(inputs), aiGroupFromRead(inputs.generationCalls)],
    generatorKinds: generatorKindCounts(inputs.generationCalls),
  };
}
