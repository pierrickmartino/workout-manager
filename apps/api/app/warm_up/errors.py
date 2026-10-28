"""Why a Warm-up Suggestion step refuses (ADR-0143): shared by the preview and the add step,
mapped to HTTP status codes by the route."""

from __future__ import annotations


class SessionNotFound(Exception):
    """The Session does not exist or is owned by another user."""


class SessionPerformed(Exception):
    """The Session has a Logged Session: it is settled record and is never rewritten."""


class UnknownDrillExercise(Exception):
    """A drill references an Exercise that is not in the catalog."""

    def __init__(self, exercise_id: int) -> None:
        super().__init__(exercise_id)
        self.exercise_id = exercise_id


__all__ = ["SessionNotFound", "SessionPerformed", "UnknownDrillExercise"]
