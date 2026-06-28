"""SQLModel table definitions.

For this walking skeleton the only persisted entity is a minimal Fitness
Profile keyed by the Clerk user id, carrying a single ``display_name`` field —
just enough to prove the Postgres round-trip end to end."""

from __future__ import annotations

from sqlmodel import Field, SQLModel


class Profile(SQLModel, table=True):
    __tablename__ = "profile"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, unique=True)
    display_name: str | None = Field(default=None)
