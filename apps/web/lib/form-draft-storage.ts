// Durable, account-scoped drafts for substantial workout forms. This collection is
// deliberately separate from both the single Live Session slot (ADR-0012/0059) and the
// IndexedDB finish outbox (ADR-0060): a draft is neither an in-progress performance nor a
// submitted record awaiting delivery.

export const FORM_DRAFTS_KEY = "workout-manager.form-drafts";
export const FORM_DRAFTS_PURGED_EVENT = "workout-manager:form-drafts-purged";
const FORM_DRAFTS_VERSION = 1;
const MAX_COLLECTION_CHARACTERS = 2_000_000;
const MAX_STORED_DRAFTS = 50;

export interface FormDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredDraft {
  accountId: string;
  draftId: string;
  savedAt: number;
  data: unknown;
}

interface DraftCollection {
  version: typeof FORM_DRAFTS_VERSION;
  drafts: StoredDraft[];
}

export interface LoadedFormDraft<T = unknown> {
  savedAt: number;
  data: T;
}

function emptyCollection(): DraftCollection {
  return { version: FORM_DRAFTS_VERSION, drafts: [] };
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.accountId === "string" &&
    typeof draft.draftId === "string" &&
    typeof draft.savedAt === "number" &&
    Number.isFinite(draft.savedAt) &&
    "data" in draft
  );
}

function readCollection(storage: FormDraftStorage): DraftCollection {
  try {
    const raw = storage.getItem(FORM_DRAFTS_KEY);
    if (raw === null) return emptyCollection();
    if (raw.length > MAX_COLLECTION_CHARACTERS) return emptyCollection();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyCollection();
    const collection = parsed as Record<string, unknown>;
    if (
      collection.version !== FORM_DRAFTS_VERSION ||
      !Array.isArray(collection.drafts) ||
      collection.drafts.length > MAX_STORED_DRAFTS ||
      !collection.drafts.every(isStoredDraft)
    ) {
      return emptyCollection();
    }
    return collection as unknown as DraftCollection;
  } catch {
    return emptyCollection();
  }
}

export function loadFormDraft<T = unknown>(
  storage: FormDraftStorage,
  accountId: string,
  draftId: string,
): LoadedFormDraft<T> | null {
  const found = readCollection(storage).drafts.find(
    (draft) => draft.accountId === accountId && draft.draftId === draftId,
  );
  return found ? { savedAt: found.savedAt, data: found.data as T } : null;
}

export function saveFormDraft(
  storage: FormDraftStorage,
  accountId: string,
  draftId: string,
  data: unknown,
  savedAt = Date.now(),
): void {
  const collection = readCollection(storage);
  const otherDrafts = collection.drafts.filter(
    (draft) => draft.accountId !== accountId || draft.draftId !== draftId,
  );
  const next: DraftCollection = {
    version: FORM_DRAFTS_VERSION,
    drafts: [...otherDrafts, { accountId, draftId, savedAt, data }],
  };
  try {
    storage.setItem(FORM_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable or full. Draft recovery is best-effort and must never
    // prevent the form itself from being used or submitted.
  }
}

export function clearFormDraft(
  storage: FormDraftStorage,
  accountId: string,
  draftId: string,
): void {
  const collection = readCollection(storage);
  const drafts = collection.drafts.filter(
    (draft) => draft.accountId !== accountId || draft.draftId !== draftId,
  );
  try {
    if (drafts.length === 0) storage.removeItem(FORM_DRAFTS_KEY);
    else storage.setItem(FORM_DRAFTS_KEY, JSON.stringify({ ...collection, drafts }));
  } catch {
    // A failed cleanup is harmless: the account/form guard still prevents cross-owner use.
  }
}

export function clearAllFormDrafts(storage: FormDraftStorage): void {
  try {
    storage.removeItem(FORM_DRAFTS_KEY);
  } catch {
    // Sign-out must continue even when browser storage is unavailable.
  }
}

function browserStorage(): FormDraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBrowserFormDraft<T>(
  accountId: string,
  draftId: string,
): LoadedFormDraft<T> | null {
  const storage = browserStorage();
  return storage ? loadFormDraft<T>(storage, accountId, draftId) : null;
}

export function writeBrowserFormDraft(
  accountId: string,
  draftId: string,
  data: unknown,
): void {
  const storage = browserStorage();
  if (storage) saveFormDraft(storage, accountId, draftId, data);
}

export function clearBrowserFormDraft(accountId: string, draftId: string): void {
  const storage = browserStorage();
  if (storage) clearFormDraft(storage, accountId, draftId);
}

export function clearBrowserFormDrafts(): void {
  const storage = browserStorage();
  if (storage) clearAllFormDrafts(storage);
  // Tell mounted draft hooks to stop their pagehide flush before sign-out navigation;
  // otherwise that final lifecycle event could recreate data just purged above.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FORM_DRAFTS_PURGED_EVENT));
  }
}
