"""Shared test helper for the typed Quantity amount axis (ADR-0032).

``reps_quantity`` builds the stored ``repetitions`` Quantity dict a Logged Set carries
now that the bare ``reps`` int is retired — the record-side sibling of the ``_abs`` /
``_bodyweight`` Load helpers dotted through the suite. Kept in one place so a test that
records "5 reps" reads as one call, and the JSON shape lives with the domain, not
copy-pasted per file."""

from __future__ import annotations

from app.domain.quantity import Quantity, QuantityKind


def reps_quantity(count: int) -> dict:
    """The stored ``repetitions`` Quantity for ``count`` reps (its JSON-column form)."""

    return Quantity(
        kind=QuantityKind.REPETITIONS, text=str(count), count=count
    ).to_dict()
