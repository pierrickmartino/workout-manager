"""Protocol-level derived values (Module H, ADR-0021).

A Protocol carries a user-editable ``name`` (F4 Slice 5). It is nullable and never
backfilled, so every read path resolves a display label through
:func:`protocol_label`: the name when the user set one, otherwise a derived
``objective · training_type`` label. Pure — no I/O, no ORM — so both serialization
and any future read can share the one rule."""

from __future__ import annotations

# The separator joining objective and training type in the derived fallback label.
_LABEL_SEPARATOR = " · "


def protocol_label(
    name: str | None, objective: str, training_type: str
) -> str:
    """The Protocol's display label: its ``name`` when set, else the derived fallback.

    A name that is ``None`` or only whitespace is treated as unset — an existing
    adopted Protocol reads as ``"objective · training_type"`` with no backfill. A
    real name is returned trimmed of surrounding whitespace.
    """

    if name is not None and name.strip():
        return name.strip()
    return f"{objective}{_LABEL_SEPARATOR}{training_type}"


__all__ = ["protocol_label"]
