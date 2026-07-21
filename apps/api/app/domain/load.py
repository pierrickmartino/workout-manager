"""Load — a typed value object for the prescribed/performed weight (ADR-0010).

``parse_load`` is the single source of truth for interpreting the free-text load
vocabulary. It is a pure function: given the raw string the AI prescribed or the
user logged, it returns a tagged ``ParsedLoad`` whose ``kind`` fixes the *meaning*
of the load once, at the write boundary, so downstream analytics never re-guess.

The free-text-ness is essential domain vocabulary, not an accident: the AI
legitimately prescribes ``bodyweight`` and ``70% 1RM``, so those are valid kinds,
not malformed data. Only some kinds resolve to a number — ``absolute`` carries a
kilogram value directly; ``bodyweight`` and ``percent_1rm`` resolve only against
the user's mass or estimated 1RM (elsewhere); ``range`` carries a low/high; and
``qualitative`` never resolves. Every ``ParsedLoad`` also keeps the original
``text`` verbatim, so the typed representation is display-ready and a backfill
loses nothing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class LoadKind(str, Enum):
    """How a Load is expressed — and therefore how (or whether) it resolves to kg."""

    ABSOLUTE = "absolute"
    BODYWEIGHT = "bodyweight"
    PERCENT_1RM = "percent_1rm"
    QUALITATIVE = "qualitative"
    RANGE = "range"


_NUMBER = r"\d+(?:\.\d+)?"


def _to_number(raw: str) -> float:
    value = float(raw)
    return value


def _format_number(value: float) -> str:
    """Render a load number without a trailing ``.0`` (``70.0`` → ``"70"``)."""

    return str(int(value)) if value == int(value) else str(value)


@dataclass(frozen=True)
class ParsedLoad:
    """A load whose ``kind`` fixes its meaning, with the payload that kind carries.

    ``text`` is the original free-text, preserved verbatim so the value is both
    display-ready and lossless. The numeric payload fields are populated only for
    the kinds that carry them: ``kg`` for ``absolute``; ``added_kg`` for the
    optional extra load on a ``bodyweight`` movement; ``percent`` for
    ``percent_1rm``; ``low_kg``/``high_kg`` for a ``range``. ``qualitative`` carries
    no number.
    """

    kind: LoadKind
    text: str
    kg: float | None = None
    added_kg: float | None = None
    percent: float | None = None
    low_kg: float | None = None
    high_kg: float | None = None

    def to_dict(self) -> dict:
        """The JSON-column representation: ``kind`` and ``text`` always, plus only
        the numeric payload fields the kind actually carries."""

        data: dict = {"kind": self.kind.value, "text": self.text}
        for field_name in ("kg", "added_kg", "percent", "low_kg", "high_kg"):
            value = getattr(self, field_name)
            if value is not None:
                data[field_name] = value
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "ParsedLoad":
        """Rebuild a ``ParsedLoad`` from its stored ``to_dict`` representation."""

        return cls(
            kind=LoadKind(data["kind"]),
            text=data["text"],
            kg=data.get("kg"),
            added_kg=data.get("added_kg"),
            percent=data.get("percent"),
            low_kg=data.get("low_kg"),
            high_kg=data.get("high_kg"),
        )


def parse_load(raw: str) -> ParsedLoad:
    """Interpret a raw free-text load into a tagged ``ParsedLoad``.

    A bare number (``"60"``) is an absolute kilogram load.
    """

    text = raw.strip()

    if re.search(r"body\s*weight|(?<![a-z])bw(?![a-z])", text, re.IGNORECASE):
        added = re.search(rf"({_NUMBER})\s*(?:kg|kgs|k)?", text, re.IGNORECASE)
        return ParsedLoad(
            kind=LoadKind.BODYWEIGHT,
            text=raw,
            added_kg=_to_number(added.group(1)) if added is not None else None,
        )

    percent = re.match(rf"({_NUMBER})\s*%", text)
    if percent is not None:
        return ParsedLoad(
            kind=LoadKind.PERCENT_1RM, text=raw, percent=_to_number(percent.group(1))
        )

    range_match = re.match(rf"({_NUMBER})\s*-\s*({_NUMBER})", text)
    if range_match is not None:
        return ParsedLoad(
            kind=LoadKind.RANGE,
            text=raw,
            low_kg=_to_number(range_match.group(1)),
            high_kg=_to_number(range_match.group(2)),
        )

    absolute = re.fullmatch(rf"({_NUMBER})\s*(?:kg|kgs|k)?", text, re.IGNORECASE)
    if absolute is not None:
        return ParsedLoad(kind=LoadKind.ABSOLUTE, text=raw, kg=_to_number(absolute.group(1)))

    return ParsedLoad(kind=LoadKind.QUALITATIVE, text=raw)


def resolve_bodyweight_kg(
    parsed: ParsedLoad, performed_body_weight: float | None
) -> float | None:
    """Resolve a ``bodyweight`` Load to its kg-equivalent against a captured mass.

    The single source of truth for bodyweight resolution (ADR-0026): a pure
    ``bodyweight`` set resolves to the Performed Body Weight, and a ``bodyweight +
    added`` set to mass plus the added load. Returns ``None`` when the Load is not a
    bodyweight kind, or when no Performed Body Weight was captured — the mass is never
    guessed, so a set with no snapshot stays unresolved (and therefore unscored)
    rather than being resolved against a fabricated weight.
    """

    if parsed.kind is not LoadKind.BODYWEIGHT:
        return None
    if performed_body_weight is None:
        return None
    return performed_body_weight + (parsed.added_kg or 0.0)


def load_from_input(kind: str, value: str | None) -> ParsedLoad | None:
    """Build a typed Load from the log form's kind picker plus its value field.

    The picked ``kind`` is authoritative — the user chose it deliberately, so a
    value of ``"70"`` under a ``percent_1rm`` pick is a percentage, not the
    absolute kilogram figure a bare parse would guess. A blank value is *no load*
    (``None``) for every kind except ``bodyweight``, which is itself a complete
    load even with no added weight. A value that cannot be read as the kind's
    number falls back to :func:`parse_load` rather than raising.
    """

    load_kind = LoadKind(kind)
    raw = (value or "").strip()

    if load_kind is LoadKind.BODYWEIGHT:
        if not raw:
            return ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight")
        try:
            added = _to_number(raw)
        except ValueError:
            return parse_load(raw)
        return ParsedLoad(
            kind=LoadKind.BODYWEIGHT,
            text=f"bodyweight + {_format_number(added)} kg",
            added_kg=added,
        )

    if not raw:
        return None

    if load_kind is LoadKind.QUALITATIVE:
        return ParsedLoad(kind=LoadKind.QUALITATIVE, text=raw)

    if load_kind is LoadKind.RANGE:
        pair = re.match(rf"({_NUMBER})\s*-\s*({_NUMBER})", raw)
        if pair is None:
            return parse_load(raw)
        low, high = _to_number(pair.group(1)), _to_number(pair.group(2))
        return ParsedLoad(
            kind=LoadKind.RANGE,
            text=f"{_format_number(low)}-{_format_number(high)} kg",
            low_kg=low,
            high_kg=high,
        )

    try:
        number = _to_number(raw)
    except ValueError:
        return parse_load(raw)

    if load_kind is LoadKind.PERCENT_1RM:
        return ParsedLoad(
            kind=LoadKind.PERCENT_1RM, text=f"{_format_number(number)}% 1RM", percent=number
        )
    return ParsedLoad(
        kind=LoadKind.ABSOLUTE, text=f"{_format_number(number)} kg", kg=number
    )


__all__ = [
    "LoadKind",
    "ParsedLoad",
    "parse_load",
    "load_from_input",
    "resolve_bodyweight_kg",
]
