"""Quantity — a typed value object for a set's amount axis (ADR-0032).

``quantity_from_input`` is the single source of truth for interpreting the
amount a set carries. It is a pure builder: given the kind the log form picked
plus its value, it returns a tagged ``Quantity`` whose ``kind`` fixes the
*meaning* of the amount once, at the write boundary, so downstream read paths
never re-guess. It is the sibling ADR-0010 already wrote for the resistance
axis, ``Load``.

A set has two axes and, until now, only one was typed: ``Load`` typed *how
hard*, while a bare ``reps: int`` left *how much* un-typed. Running proves
``reps`` was the un-typed axis all along, so ``Quantity`` carries a ``kind`` —
``repetitions`` (a count), ``distance`` (canonical metres, with an optional
companion duration), or ``duration`` (canonical seconds). Distance is stored in
**metres** (miles convert on the way in) and duration in **seconds**: one figure
for all math, never a stored display-unit. Like ``ParsedLoad`` every ``Quantity``
keeps the original ``text`` verbatim, so the typed value is display-ready and a
backfill loses nothing.

**Pace is never stored.** It is arithmetic on two measured numbers (distance and
duration) and is a read-time projection of a ``distance`` Quantity that carries a
``duration_s`` — the endurance counterpart to how Estimated 1RM projects from a
Load. ``has_pace`` reports only that the projection is *derivable*; computing it
is a later feature.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class QuantityKind(str, Enum):
    """How a set's amount is expressed — and therefore which payload it carries."""

    REPETITIONS = "repetitions"
    DISTANCE = "distance"
    DURATION = "duration"


_METRES_PER_KM = 1000.0
_METRES_PER_MILE = 1609.344
_SECONDS_PER_MINUTE = 60
_SECONDS_PER_HOUR = 3600

# Free-text inference (``quantity_from_text``): the unit words a prescription's
# prose might name, each mapped to its canonical multiplier. Distance canonicalises
# to metres, duration to seconds. Keyed lower-case; the matcher lower-cases first so
# "KM" and "Min" resolve too.
_DISTANCE_UNIT_METRES: dict[str, float] = {
    "km": _METRES_PER_KM,
    "kilometer": _METRES_PER_KM,
    "kilometers": _METRES_PER_KM,
    "kilometre": _METRES_PER_KM,
    "kilometres": _METRES_PER_KM,
    "mi": _METRES_PER_MILE,
    "mile": _METRES_PER_MILE,
    "miles": _METRES_PER_MILE,
}
_DURATION_UNIT_SECONDS: dict[str, float] = {
    "s": 1.0,
    "sec": 1.0,
    "secs": 1.0,
    "second": 1.0,
    "seconds": 1.0,
    "min": float(_SECONDS_PER_MINUTE),
    "mins": float(_SECONDS_PER_MINUTE),
    "minute": float(_SECONDS_PER_MINUTE),
    "minutes": float(_SECONDS_PER_MINUTE),
    "h": float(_SECONDS_PER_HOUR),
    "hr": float(_SECONDS_PER_HOUR),
    "hrs": float(_SECONDS_PER_HOUR),
    "hour": float(_SECONDS_PER_HOUR),
    "hours": float(_SECONDS_PER_HOUR),
}

# The mile synonyms ``_build`` (``quantity_from_input``) recognises are derived from
# the distance table above, so the two entry points share one source of truth for
# what counts as a mile — add a synonym once and both paths pick it up.
_MILE_UNITS = frozenset(
    unit for unit, metres in _DISTANCE_UNIT_METRES.items() if metres == _METRES_PER_MILE
)

# A number (int or decimal) followed by an optional-space unit word — "7km",
# "6.8 km", "30 min", "90s". The clock form (mm:ss / hh:mm:ss) and a bare integer
# are matched separately.
_NUMBER_UNIT = re.compile(r"^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$")
_CLOCK_TIME = re.compile(r"^\d+(?::\d+)+$")
_BARE_INTEGER = re.compile(r"^\d+$")


def _parse_time_to_seconds(raw: str) -> float:
    """Read a time value into canonical seconds.

    Accepts colon-separated ``mm:ss`` and ``hh:mm:ss``, and a bare number of
    seconds. Each segment is summed in base-60, most-significant first.
    """

    if ":" not in raw:
        return float(raw)
    seconds = 0.0
    for segment in raw.split(":"):
        seconds = seconds * _SECONDS_PER_MINUTE + float(segment)
    return seconds


@dataclass(frozen=True)
class Quantity:
    """An amount whose ``kind`` fixes its meaning, with the payload that kind carries.

    ``text`` is the original input, preserved verbatim so the value is both
    display-ready and lossless. The payload fields are populated only for the kind
    that carries them: ``count`` for ``repetitions``; ``metres`` (plus an optional
    companion ``duration_s``) for ``distance``; ``seconds`` for ``duration``.
    """

    kind: QuantityKind
    text: str
    count: int | None = None
    metres: float | None = None
    duration_s: float | None = None
    seconds: float | None = None

    @property
    def repetitions(self) -> int | None:
        """The rep count for a ``repetitions`` Quantity, ``None`` for any other kind.

        Gives the strength read paths (``one_rep_max``, ``personal_records``,
        ``volume``) one call site with a partiality mirroring ``estimate_1rm``: a
        distance or duration set has no reps, so it degrades to ``None`` rather than
        being special-cased as "a run".
        """

        return self.count if self.kind is QuantityKind.REPETITIONS else None

    @property
    def has_pace(self) -> bool:
        """Whether pace is derivable — true only for a ``distance`` that carries a
        companion ``duration_s``.

        Pace is never stored (ADR-0032): it is a read-time projection over the two
        measured numbers, defined only when both are present, mirroring how
        Estimated 1RM projects from a Load. This reports derivability; computing the
        figure is a later feature.
        """

        return self.kind is QuantityKind.DISTANCE and self.duration_s is not None

    def to_dict(self) -> dict:
        """The JSON-column representation: ``kind`` and ``text`` always, plus only
        the payload fields the kind actually carries."""

        data: dict = {"kind": self.kind.value, "text": self.text}
        for field_name in ("count", "metres", "duration_s", "seconds"):
            value = getattr(self, field_name)
            if value is not None:
                data[field_name] = value
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "Quantity":
        """Rebuild a ``Quantity`` from its stored ``to_dict`` representation."""

        return cls(
            kind=QuantityKind(data["kind"]),
            text=data["text"],
            count=data.get("count"),
            metres=data.get("metres"),
            duration_s=data.get("duration_s"),
            seconds=data.get("seconds"),
        )


def repetitions_of(stored: dict | None) -> int | None:
    """The rep count carried by a *stored* Quantity dict, or ``None`` for a non-rep amount.

    The one accessor the strength/volume read paths reach a logged set's reps through
    (ADR-0032): it rebuilds the Quantity from its JSON-column form and reads
    ``repetitions``, so a load-less ``None`` column, or a distance/duration amount,
    degrades to ``None`` at a single call site instead of each caller re-deciding.
    """

    if stored is None:
        return None
    return Quantity.from_dict(stored).repetitions


def metres_of(stored: dict | None) -> float | None:
    """The distance in metres carried by a *stored* Quantity dict, or ``None``.

    The endurance sibling of :func:`repetitions_of` (ADR-0032/0049): the one accessor
    the Weekly Distance read path reaches a logged set's distance through. It rebuilds
    the Quantity from its JSON-column form and returns the canonical ``metres`` for a
    ``distance`` amount; a rep count, a timeless duration, or a load-less ``None`` column
    degrades to ``None`` at this single call site instead of each caller re-deciding.
    """

    if stored is None:
        return None
    quantity = Quantity.from_dict(stored)
    return quantity.metres if quantity.kind is QuantityKind.DISTANCE else None


def quantity_from_input(
    kind: str,
    value: str | None,
    *,
    unit: str = "km",
    duration: str | None = None,
) -> Quantity | None:
    """Build a typed Quantity from the log form's kind picker plus its value.

    The picked ``kind`` is authoritative. Blank or unparseable values, and unknown
    kinds, return ``None`` rather than raising — the tolerance ``domain/load.py``
    keeps at the boundary. ``unit`` selects km or miles for a ``distance`` value
    (canonicalised to metres); ``duration`` is the optional companion time on a
    ``distance``, from which pace becomes derivable.
    """

    raw = (value or "").strip()
    if not raw:
        return None

    try:
        return _build(kind, raw, unit, duration)
    except ValueError:
        # An unparseable value is tolerated, not fatal — the same boundary
        # discipline ``domain/load.py`` keeps (blank/garbage never raises).
        return None


def _build(kind: str, raw: str, unit: str, duration: str | None) -> Quantity | None:
    """Assemble the Quantity for a known kind, or ``None`` for an unknown one.

    Numeric conversion may raise ``ValueError`` on garbage input; the caller
    catches it so the boundary stays exception-free.
    """

    if kind == QuantityKind.REPETITIONS.value:
        return Quantity(kind=QuantityKind.REPETITIONS, text=raw, count=int(raw))

    if kind == QuantityKind.DISTANCE.value:
        metres_per_unit = _METRES_PER_MILE if unit in _MILE_UNITS else _METRES_PER_KM
        unit_label = "mi" if unit in _MILE_UNITS else "km"
        companion = (duration or "").strip()
        return Quantity(
            kind=QuantityKind.DISTANCE,
            text=f"{raw} {unit_label}",
            metres=float(raw) * metres_per_unit,
            duration_s=_parse_time_to_seconds(companion) if companion else None,
        )

    if kind == QuantityKind.DURATION.value:
        return Quantity(
            kind=QuantityKind.DURATION,
            text=raw,
            seconds=_parse_time_to_seconds(raw),
        )

    return None


def quantity_from_text(text: str | None) -> Quantity:
    """Infer a typed Quantity from a prescription's free-text amount (ADR-0050).

    The sibling of :func:`quantity_from_input`, which is *told* the kind by the log
    form. This one reads the kind off the prose — the one shared primitive reused by
    both the generation fallback (a model that emits a bare amount string) and the
    one-time backfill migration (existing free-text ``reps``). It **always** returns a
    Quantity: ``repetitions`` is the safe default, so a malformed or legacy amount
    degrades gracefully rather than crashing the log form.

    - ``"7 km"`` / ``"7km"`` / ``"7 KM"`` / ``"3 mi"`` → a ``distance`` (canonical metres);
    - ``"30 min"`` / ``"0:30"`` / ``"90s"`` → a ``duration`` (canonical seconds);
    - ``"8"`` (a clean count), ``"8-12"`` (a range), ``"AMRAP"``, or anything
      unrecognised → ``repetitions``, the safe default.

    The original ``text`` is carried through verbatim, so display loses nothing.
    """

    original = text or ""
    raw = original.strip()

    if _CLOCK_TIME.match(raw):
        return Quantity(
            kind=QuantityKind.DURATION,
            text=original,
            seconds=_parse_time_to_seconds(raw),
        )

    match = _NUMBER_UNIT.match(raw)
    if match:
        number, unit = match.group(1), match.group(2).lower()
        if unit in _DISTANCE_UNIT_METRES:
            return Quantity(
                kind=QuantityKind.DISTANCE,
                text=original,
                metres=float(number) * _DISTANCE_UNIT_METRES[unit],
            )
        if unit in _DURATION_UNIT_SECONDS:
            return Quantity(
                kind=QuantityKind.DURATION,
                text=original,
                seconds=float(number) * _DURATION_UNIT_SECONDS[unit],
            )

    # Everything else is the safe default: a bare integer keeps its count; a range,
    # AMRAP, or unparseable prose is repetitions with no count — never a crash.
    count = int(raw) if _BARE_INTEGER.match(raw) else None
    return Quantity(kind=QuantityKind.REPETITIONS, text=original, count=count)


def prescribed_quantity_from_input(
    kind: str | None,
    value: str | None,
    *,
    unit: str = "km",
    duration: str | None = None,
    fallback_text: str | None = None,
) -> Quantity:
    """Type a plan's Prescribed Quantity from a picked kind plus a free-text target (ADR-0050).

    The plan-side write boundary the Hand-Authored builder feeds (#345), and the twin of
    how generation types its Prescribed Quantity (``GeneratedExercisePrescription.
    typed_quantity``): the picked ``kind`` is authoritative. When a usable kind + value is
    supplied it is built through :func:`quantity_from_input` — the same builder the log
    form's kind picker uses — so a ``distance`` the user chose is stored a distance even
    when its target reads ``"5"`` with no unit. When no kind/value is given, or the value
    cannot be typed under the picked kind (a rep range picked as a distance), it falls
    through to :func:`quantity_from_text` — the shared #341 inference the generation
    fallback and the backfill migration also use.

    Unlike :func:`quantity_from_input` it **always** returns a Quantity (``repetitions``
    is the safe default), so an authored plan is born typed just like a generated or
    backfilled one. ``fallback_text`` is the prose the inference reads; it defaults to
    ``value`` — for the Hand-Authored builder the single free-text target is both the
    value tried and the prose inferred from — but a caller may point it elsewhere.
    """

    if kind and value:
        built = quantity_from_input(kind, value, unit=unit, duration=duration)
        if built is not None:
            return built
    return quantity_from_text(fallback_text if fallback_text is not None else value)


__all__ = [
    "QuantityKind",
    "Quantity",
    "quantity_from_input",
    "quantity_from_text",
    "prescribed_quantity_from_input",
    "repetitions_of",
    "metres_of",
]
