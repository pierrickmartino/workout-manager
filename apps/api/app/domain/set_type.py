"""The Set Type domain value — a curated, closed annotation on a set (ADR-0065).

**Set Type** labels what one set *is* — **warm-up, working, drop, failure, AMRAP** —
drawn from a fixed catalog, never user- or AI-invented (the same species as Training
Type and Progression Scheme). It is carried per Exercise Prescription on the *plan* and
per Logged Set on the *record*. It is **descriptive only** save for one behavioural
consequence — a warm-up leaves working-set analytics (ADR-0065):

- An **unset** Set Type resolves to **working**, so a plain set needs no choice and no
  existing row shifts.
- It **never feeds Progression** — schemes keep reading the rep grammar; an ``AMRAP``
  label is not the ``"5+"`` rep target. This module holds *no* stepping logic.
- Its one analytics tie is :func:`is_warm_up`, the single predicate the Volume and
  Estimated-1RM projections read to drop a ``warm_up`` set (#453); every other member and
  the unset default read as working and change no projection.

Pure — no I/O, no ORM. :func:`parse_set_type` is the *write*-boundary check (turns an
incoming string into a member or ``None``, inventing no default so an invalid value can
be rejected); :func:`resolve_set_type` is the *read*-side resolution (a null or unknown
stored value reads as ``working``, staying total); :func:`is_warm_up` reads that
resolution to answer the one analytics question.
"""

from __future__ import annotations

from enum import Enum


class SetType(str, Enum):
    """The identity of a Set Type — a member of a curated, closed set (ADR-0065).

    The v1 catalog is fixed and never user- or AI-authored, the same discipline that
    keeps the Progression Scheme, Skin, and Muscle Group catalogs closed. ``WORKING`` is
    the default an unset annotation resolves to, so every existing and un-annotated set
    reads as a working set. ``WARM_UP`` is the one member with an analytics consequence —
    a warm-up leaves working-set Volume and strength records (ADR-0065, #453), applied via
    :func:`is_warm_up` in the Volume and Estimated-1RM projections; every other member is
    a descriptive label that changes no projection.
    """

    WARM_UP = "warm_up"
    WORKING = "working"
    DROP = "drop"
    FAILURE = "failure"
    AMRAP = "amrap"


#: The Set Type an unset (NULL) annotation resolves to. Resolving to working keeps every
#: existing row and every un-annotated set reading exactly as it did before Set Type.
DEFAULT_SET_TYPE = SetType.WORKING


def parse_set_type(value: str | None) -> SetType | None:
    """Parse an *incoming* Set Type string to its catalog member, or ``None``.

    The one place a write path turns a request value into a validated Set Type. A
    ``None`` or blank/whitespace selection is the un-annotated default and normalizes to
    ``None`` (stored as NULL — *not* coerced to ``working``, so "unset" stays honestly
    unset). A present-but-unknown value also returns ``None`` so a boundary validator can
    reject it (422) rather than silently coercing it. This inverts
    :func:`resolve_set_type`, which defaults on the *read* path; keeping the two separate
    is what lets the write boundary distinguish "unset" from "invalid".
    """

    if value is None or not value.strip():
        return None
    try:
        return SetType(value)
    except ValueError:
        return None


def resolve_set_type(value: str | None) -> SetType:
    """Resolve a *stored* Set Type value to a member, defaulting unset → ``working``.

    The read-side resolution used wherever a set's effective type is needed. A null
    selection resolves to :data:`DEFAULT_SET_TYPE` (working), reproducing pre-Set-Type
    behaviour. It stays **total**: a value that names no member (only reachable if a row
    predates the validated boundary) also reads as ``working`` rather than raising, so a
    read never fails on legacy or foreign data.
    """

    if value is None:
        return DEFAULT_SET_TYPE
    try:
        return SetType(value)
    except ValueError:
        return DEFAULT_SET_TYPE


def is_warm_up(value: str | None) -> bool:
    """Whether a stored Set Type value is a **warm-up** — the one analytics consequence.

    A warm-up is the single member that *leaves* working-set analytics (ADR-0065): the
    Volume projection drops it before summing tonnage, and it is never a strength-record
    candidate (Estimated 1RM / Personal Record / Top Set). Every other member — and an
    unset value, which resolves to ``working`` — reads ``False`` and keeps counting. Built
    on :func:`resolve_set_type` so it stays total: legacy or foreign data reads as working
    (not a warm-up) rather than raising.
    """

    return resolve_set_type(value) is SetType.WARM_UP


__all__ = [
    "DEFAULT_SET_TYPE",
    "SetType",
    "is_warm_up",
    "parse_set_type",
    "resolve_set_type",
]
