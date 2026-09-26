"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FORM_DRAFTS_PURGED_EVENT,
  clearBrowserFormDraft,
  readBrowserFormDraft,
  writeBrowserFormDraft,
  type LoadedFormDraft,
} from "./form-draft-storage";

interface UseFormDraftOptions<T> {
  draftId: string;
  data: T;
  isDirty: boolean;
  validate: (value: unknown) => value is T;
  onRestore: (data: T) => void;
}

export interface FormDraftRecovery {
  savedAt: number;
  restore: () => void;
  discard: () => void;
}

interface ScopedCandidate<T> {
  scope: string;
  draft: LoadedFormDraft<T>;
}

export function useFormDraft<T>({
  draftId,
  data,
  isDirty,
  validate,
  onRestore,
}: UseFormDraftOptions<T>): {
  recovery: FormDraftRecovery | null;
  clearAfterSave: () => void;
} {
  const { userId, isLoaded } = useAuth();
  const [candidate, setCandidate] = useState<ScopedCandidate<T> | null>(null);
  const [activeScope, setActiveScope] = useState<string | null>(null);
  const scope = userId ? `${userId}\u0000${draftId}` : null;
  const canPersist = scope !== null && activeScope === scope;
  const latest = useRef({ data, isDirty });
  const persistenceEnabled = useRef(canPersist);
  latest.current = { data, isDirty };
  persistenceEnabled.current = canPersist;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stopAfterPurge = () => {
      persistenceEnabled.current = false;
      setCandidate(null);
      setActiveScope(null);
    };
    window.addEventListener(FORM_DRAFTS_PURGED_EVENT, stopAfterPurge);
    return () => window.removeEventListener(FORM_DRAFTS_PURGED_EVENT, stopAfterPurge);
  }, []);

  useEffect(() => {
    setCandidate(null);
    setActiveScope(null);
    if (!isLoaded || !userId) return;
    const stored = readBrowserFormDraft<unknown>(userId, draftId);
    if (stored && validate(stored.data)) {
      setCandidate({
        scope: `${userId}\u0000${draftId}`,
        draft: { savedAt: stored.savedAt, data: stored.data },
      });
      return;
    }
    if (stored) clearBrowserFormDraft(userId, draftId);
    setActiveScope(`${userId}\u0000${draftId}`);
  }, [draftId, isLoaded, userId, validate]);

  useEffect(() => {
    if (!canPersist || !isDirty || !userId) return;
    writeBrowserFormDraft(userId, draftId, data);
  }, [canPersist, data, draftId, isDirty, userId]);

  useEffect(() => {
    if (!canPersist || !userId || typeof window === "undefined") return;
    const flush = () => {
      if (persistenceEnabled.current && latest.current.isDirty) {
        writeBrowserFormDraft(userId, draftId, latest.current.data);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [canPersist, draftId, userId]);

  const discard = useCallback(() => {
    if (userId) clearBrowserFormDraft(userId, draftId);
    setCandidate(null);
    setActiveScope(scope);
  }, [draftId, scope, userId]);

  const restore = useCallback(() => {
    if (!candidate || candidate.scope !== scope) return;
    onRestore(candidate.draft.data);
    setCandidate(null);
    setActiveScope(scope);
  }, [candidate, onRestore, scope]);

  const clearAfterSave = useCallback(() => {
    if (userId) clearBrowserFormDraft(userId, draftId);
    setCandidate(null);
    setActiveScope(null);
  }, [draftId, userId]);

  return {
    recovery: candidate && candidate.scope === scope
      ? { savedAt: candidate.draft.savedAt, restore, discard }
      : null,
    clearAfterSave,
  };
}
