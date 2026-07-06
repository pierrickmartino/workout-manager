"""Estimated 1RM — the single comparable strength figure behind Personal Records.

``estimate_1rm`` turns one Logged Set's absolute Load (in kilograms) and its integer
reps into an *estimate* of the heaviest single repetition the user could perform. It
uses the Epley formula, ``1RM = kg × (1 + reps/30)``, with reps=1 as the trivial
identity: a lift performed for a single rep already *is* the 1RM, so no estimation is
applied. The estimate is only trustworthy in the **1–12 rep** window — outside it
(AMRAP / high-rep sets) the model returns ``None`` rather than a figure the domain
shouldn't compare against.

Pure and dependency-free (like ``domain/progression.py``): no ORM, no HTTP. It is the
common yardstick reused for Personal Record detection and the Exercise Detail strength
number, so the estimate lives in exactly one place."""

from __future__ import annotations

# The rep window over which the Epley estimate is trustworthy. Below 1 there is no
# set; above 12 the linear model drifts too far from reality to compare honestly.
MIN_TRUSTWORTHY_REPS = 1
MAX_TRUSTWORTHY_REPS = 12


def estimate_1rm(load_kg: float, reps: int) -> float | None:
    """Return the Epley Estimated 1RM for ``load_kg`` lifted for ``reps``.

    A single rep returns the load unchanged — the lift already is the 1RM. Reps
    outside the trustworthy 1–12 window return ``None``, so AMRAP and high-rep sets
    never produce a number the domain would treat as comparable.
    """

    if reps < MIN_TRUSTWORTHY_REPS or reps > MAX_TRUSTWORTHY_REPS:
        return None

    if reps == 1:
        return load_kg

    return load_kg * (1 + reps / 30)


__all__ = ["estimate_1rm", "MIN_TRUSTWORTHY_REPS", "MAX_TRUSTWORTHY_REPS"]
