"""The user's current Operator Level, read from their Logged Sessions (ADR-0136).

One read of the record, projected through the shared gamification read model so the
level an Avatar is judged against is exactly the one Home and Profile show
(ADR-0018/0019). The level is computed at the moment of asking; nothing is stored."""

from __future__ import annotations

from datetime import date

from app.logbook.gamification import project_gamification
from app.repositories.logged_session_repository import LoggedSessionRepository


def current_operator_level(clerk_user_id: str, logged: LoggedSessionRepository) -> int:
    """The Operator Level the user's whole Logged-Session history earns today."""

    history = logged.list_for_user(clerk_user_id)
    return project_gamification(history, today=date.today()).level.level


__all__ = ["current_operator_level"]
