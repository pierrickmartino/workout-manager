"""Whether a Protocol has been started, the fact that gates its Delete (ADR-0125).

A Protocol is **started** once any Logged Session references one of its member Sessions,
whatever its Completion Outcome: an Incomplete log performs nothing (ADR-0013) but is still
logged training, so it counts here. Only an un-started Protocol may be deleted. Pure — it
reads plain Session ids, so the index and the Delete service share the one rule."""

from __future__ import annotations

from collections.abc import Iterable


def logged_session_ids(referenced: Iterable[int | None]) -> frozenset[int]:
    """The Session ids a user's Logged Sessions reference, plan-less records dropped.

    Built once per request over the whole history, so checking many Protocols against it
    stays a set lookup each."""

    return frozenset(session_id for session_id in referenced if session_id is not None)


def is_started(member_session_ids: Iterable[int], logged: frozenset[int]) -> bool:
    """Whether any of a Protocol's member Sessions has a Logged Session."""

    return any(session_id in logged for session_id in member_session_ids)


__all__ = ["is_started", "logged_session_ids"]
