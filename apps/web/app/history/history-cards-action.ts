"use server";

// The read-only Server Action behind History's windowed cards (ADR-0128): the client holds
// the whole index and asks for the full records of the matches it is about to show, one
// window of ids at a time. A pure wrapper over `fetchHistoryByIds` — the JWT-attaching read
// stays on the server (ADR-0022), and the backend scopes the ids to their owner.

import { fetchHistoryByIds } from "@/lib/logs";
import {
  isValidHistoryWindowIds,
  toHistoryCard,
  type HistoryCard,
} from "@/lib/history-window";

export interface HistoryCardsResult {
  cards: HistoryCard[] | null;
  error: string | null;
}

export async function fetchHistoryCards(ids: unknown): Promise<HistoryCardsResult> {
  // A Server Action is a public endpoint: its argument is untrusted input.
  if (!isValidHistoryWindowIds(ids)) {
    return { cards: null, error: "Could not tell which records to load." };
  }

  try {
    const envelope = await fetchHistoryByIds(ids);
    if (!envelope.success || !envelope.data) {
      return { cards: null, error: envelope.error ?? "Could not load these records." };
    }
    return { cards: envelope.data.map(toHistoryCard), error: null };
  } catch {
    // `apiGet` rejects on a transport failure or a missing session; the card list offers a
    // retry rather than erroring the whole screen.
    return { cards: null, error: "Could not load these records." };
  }
}
