// Pure view-model for the admin AI audit log's filters and pager (issue #732, ADR-0135). The
// page reads its state from the URL (`?kind=&outcome=&user=&page=`), so a filtered view can be
// refreshed or shared; this module narrows those untrusted values, builds the endpoint query
// from them, and builds the page links. No server or React imports, so `node --test` runs it.

import type { PaginationMeta } from "./api.ts";
import { KIND_LABELS, OUTCOME_LABELS } from "./admin-generation-calls-view.ts";

// The calls one page holds. The endpoint's own default, so the first page reads the same
// whether or not the window is spelled out.
export const GENERATION_CALL_PAGE_SIZE = 50;

const AUDIT_LOG_PATH = "/admin/ai-audit-log";

// Each `null` leaves that axis open; set filters combine on the backend (AND).
export interface AuditLogFilters {
  generatorKind: string | null;
  outcome: string | null;
  userId: string | null;
}

// `page` is 1-based, as the URL and the operator count it.
export interface AuditLogState {
  filters: AuditLogFilters;
  page: number;
}

// The pager below the list: which calls this page shows, and the links either way. A `null`
// link is an end of the log.
export interface AuditLogPager {
  rangeLabel: string;
  newerHref: string | null;
  olderHref: string | null;
}

export interface FilterOption {
  value: string;
  label: string;
}

// What a `searchParams` entry can be: absent, one value, or a repeated parameter.
type SearchParamValue = string | readonly string[] | undefined;

export type AuditLogSearchParams = Readonly<Record<string, SearchParamValue>>;

function optionsFrom(labels: Record<string, string>): FilterOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

// The choices the kind and outcome selects offer, beside an "any" option the page adds.
export const GENERATOR_KIND_OPTIONS: readonly FilterOption[] = optionsFrom(KIND_LABELS);
export const OUTCOME_OPTIONS: readonly FilterOption[] = optionsFrom(OUTCOME_LABELS);

function firstValue(value: SearchParamValue): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

// A value the backend knows, or `null`: an unknown one would only come back as a 422, so a
// hand-edited URL drops it instead of breaking the page.
function knownValue(
  labels: Record<string, string>,
  value: SearchParamValue,
): string | null {
  const raw = firstValue(value);
  return raw !== undefined && Object.hasOwn(labels, raw) ? raw : null;
}

function userIdFrom(value: SearchParamValue): string | null {
  const trimmed = firstValue(value)?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function pageFrom(value: SearchParamValue): number {
  const parsed = Number(firstValue(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

// Narrow the page URL's untrusted query onto a filter and page state.
export function parseAuditLogState(params: AuditLogSearchParams): AuditLogState {
  return {
    filters: {
      generatorKind: knownValue(KIND_LABELS, params.kind),
      outcome: knownValue(OUTCOME_LABELS, params.outcome),
      userId: userIdFrom(params.user),
    },
    page: pageFrom(params.page),
  };
}

// Whether the operator has narrowed the log at all: it changes the empty state and offers Clear.
export function hasAuditLogFilters(filters: AuditLogFilters): boolean {
  return (
    filters.generatorKind !== null || filters.outcome !== null || filters.userId !== null
  );
}

// Only the set entries, in a fixed order, so equal states give equal strings.
function queryString(entries: ReadonlyArray<[string, string | null]>): string {
  const set = entries.filter((entry): entry is [string, string] => entry[1] !== null);
  return new URLSearchParams(set).toString();
}

// The `GET /api/admin/generation-calls` query for a state: its filters and its page window.
export function generationCallsApiQuery({ filters, page }: AuditLogState): string {
  return queryString([
    ["generator_kind", filters.generatorKind],
    ["outcome", filters.outcome],
    ["clerk_user_id", filters.userId],
    ["limit", String(GENERATION_CALL_PAGE_SIZE)],
    ["offset", String((page - 1) * GENERATION_CALL_PAGE_SIZE)],
  ]);
}

// The page's own URL for a state. Page 1 is left out, so the unfiltered log is the bare path.
export function auditLogHref({ filters, page }: AuditLogState): string {
  const query = queryString([
    ["kind", filters.generatorKind],
    ["outcome", filters.outcome],
    ["user", filters.userId],
    ["page", page > 1 ? String(page) : null],
  ]);
  return query === "" ? AUDIT_LOG_PATH : `${AUDIT_LOG_PATH}?${query}`;
}

function rangeLabel(meta: PaginationMeta, shown: number): string {
  if (shown === 0) return `0 of ${meta.total}`;
  return `${meta.offset + 1}–${meta.offset + shown} of ${meta.total}`;
}

// The pager for a page the endpoint answered, or `null` when every match fits on one page.
// Newer is the previous page (the log is newest first), older the next.
export function toAuditLogPager(
  state: AuditLogState,
  meta: PaginationMeta,
): AuditLogPager | null {
  if (meta.offset === 0 && meta.total <= meta.limit) return null;

  const shown = Math.max(0, Math.min(meta.limit, meta.total - meta.offset));
  const hasNewer = state.page > 1;
  const hasOlder = meta.offset + shown < meta.total;
  return {
    rangeLabel: rangeLabel(meta, shown),
    newerHref: hasNewer ? auditLogHref({ ...state, page: state.page - 1 }) : null,
    olderHref: hasOlder ? auditLogHref({ ...state, page: state.page + 1 }) : null,
  };
}
