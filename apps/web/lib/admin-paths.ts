// The admin area's route paths (spec #767), named once: the sidebar's nested entries, the admin
// home's nav rows, the dashboard tiles' links and the lists' own href builders all read these,
// so a moved route is one edit rather than a hunt for string literals. No imports, so every
// view-model (and its `node --test` file) can depend on it.

export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_CATALOG_PATH = "/admin/exercises";
export const ADMIN_AUDIT_LOG_PATH = "/admin/ai-audit-log";
