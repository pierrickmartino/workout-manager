# 0128 — History is a full index over windowed records

`GET /api/logs` returned every Logged Session with every Logged Set, and the History
screen handed all of it to a client component that rendered a card per record. The
payload and the first render both grew with the user's whole training life: two years
at three sessions a week is about 300 records and several thousand set rows
(audit V-1, `docs/research/audit/vercel/react-best-practices-2026-10-10.md`).

Cutting the list to "the newest N" alone would break three things the screen already
promises:

- **Filtering sees the whole record (Q4).** An exercise or Training Type filter over
  only the loaded records would silently miss older matches.
- **The count is honest (Q9).** "3 of 24 LOGGED" needs the full total and the full
  match count.
- **The exercise picker offers every movement ever logged (Q5).**

## The decision

History is read in two shapes:

1. **The index** — `GET /api/logs/index`: one slim row per Logged Session, newest
   first, `{id, performed_on, training_type, exercise_names, deletable,
   uncompletable}`. The screen filters, counts and builds the picker over this, so all
   three promises above hold over the whole record.
2. **Windows of full records** — `GET /api/logs?limit=n` (the newest) or
   `GET /api/logs?ids=…` (an explicit batch). Both are capped at
   `HISTORY_WINDOW_MAX = 30`, owner-scoped, and return records in history order. An
   id that is missing or someone else's is dropped, not an error: a record deleted in
   another tab between the index read and the batch read simply drops out, and the
   next revalidation corrects the index.

The screen renders the cards for the first 30 matching index rows and fetches the next
30 matching ids on "Show more". Without parameters, `GET /api/logs` is unchanged, so
its other callers keep their contract.

## Why ids and not a cursor

The client already holds the index, so it knows exactly which records it needs next:
the next 30 that *match the active filter*. A keyset cursor can only say "the next 30
after this one", which is the wrong set as soon as a filter is on. An id batch says
exactly what is wanted.

## The verdicts ride on the index

The ADR-0034 correction verdicts (`deletable`, `uncompletable`) are computed over the
whole history, and a tail-first correction can change an *older* record's verdict —
deleting the newest Session of a Protocol makes the previous one deletable, and that
one may sit beyond the first window. Windows therefore carry no verdicts. The index is
re-read on every revalidation, so every card on screen reads a current verdict.

## What this amends

- **Q4 (filter changes are local):** a filter change still never re-runs the Server
  Component or re-reads the whole history, but it may now fetch the cards for matches
  not yet loaded. Q8, Q9 and ADR-0100 are unchanged: the filter is still mirrored with
  `replaceState`, and a shared filtered link is resolved on the server against the
  index, so its first matching window renders on first paint.

## Known limit

The index and its verdicts still load every Logged Session with its sets on the
server. This decision bounds the **payload and the rendering**, which is what grew
without limit; it does not bound the database read. A lighter index query would need
the contiguity gate rewritten over a lighter view. Revisit if the
`/api/logs/index` p95 becomes a measured problem.
