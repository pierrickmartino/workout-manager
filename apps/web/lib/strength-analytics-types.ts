// Shared Strength Analytics types. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components. The server-only data access
// (Clerk auth + fetch) lives in `lib/strength-analytics.ts`.

import type { PersonalRecordEntry } from "./analytics-types";

// The Strength Analytics screen's read model (F-strength Slice 1): the all-time,
// all-Exercise Personal Record timeline for one page, newest-first, and the
// `has_qualifying_strength` gate. `records` is empty when the requested page holds no
// PRs; the gate is `false` for a user with no comparable strength history, which is
// how the account Analytics screen decides whether to offer this screen at all.
export interface StrengthAnalyticsOverview {
  has_qualifying_strength: boolean;
  records: PersonalRecordEntry[];
}
