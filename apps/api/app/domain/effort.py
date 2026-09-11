"""Effort — a typed value object for how hard a set was or should be (ADR-0066).

``Effort = {scale, value}`` carries its own **scale** so the number is never re-guessed,
the same discipline ``Load`` (ADR-0010) and ``Quantity`` (ADR-0032) already apply to the
resistance and amount axes. The two scales are the two ways people think about effort:

- **RPE** (rate of perceived exertion, higher = harder): ``0–10``, half-steps allowed
  (``6``, ``6.5``, ``7``, …) — the conventional resolution.
- **RIR** (reps in reserve, higher = easier): an integer ``0–5``, with ``5`` read as a
  "5+" ceiling (reps-in-reserve past five is not meaningfully distinguished).

The scale is stored, never inferred; the cross-scale rendering is a **read-time
projection** computed per reader (``as_rpe`` / ``as_rir`` / :meth:`Effort.projected`),
using the standard relation ``rpe ≈ 10 − rir`` — the effort counterpart of the kg/lb
Weight-Unit projection (ADR-0047). :func:`logged_effort_rpe` is the one seam the
Progression gate reads through: it normalizes a logged RIR to its RPE-equivalent before
the low-effort threshold compare, and reads a returning user's legacy
``perceived_difficulty`` int as an ``rpe``-scale value, so no existing record steps
differently (ADR-0066).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class EffortScale(str, Enum):
    """How an Effort is expressed — and therefore how it validates and projects."""

    RPE = "rpe"
    RIR = "rir"


# The RPE band and its resolution: 0–10 inclusive, in half-steps. The relation the whole
# module hangs on — ``rpe = RPE_MAX − rir`` — is anchored on ``RPE_MAX`` so the two scales
# never drift.
RPE_MIN = 0.0
RPE_MAX = 10.0
RPE_STEP = 0.5

# The RIR band: an integer 0–5, where 5 is the "5+" ceiling (further reps-in-reserve is not
# meaningfully distinguished, ADR-0066).
RIR_MIN = 0
RIR_MAX = 5

#: The scale a value with no declared scale is read as — the conventional RPE, so an
#: rpe-only client (and the legacy ``perceived_difficulty`` int) needs no scale to log.
DEFAULT_EFFORT_SCALE = EffortScale.RPE


def _format_value(value: float) -> float | int:
    """Collapse a whole value to an ``int`` so it serializes as ``7`` / ``3``, not
    ``7.0`` — mirroring how ``load._format_number`` drops a trailing ``.0``. A genuine
    half-step (``6.5``) is left as a ``float``."""

    return int(value) if value == int(value) else value


@dataclass(frozen=True)
class Effort:
    """An effort whose ``scale`` fixes how its ``value`` is read (ADR-0066).

    Construction is the single validation point: an ``Effort`` object is always a valid
    RPE (0–10, half-steps) or RIR (integer 0–5), so every downstream reader can trust the
    value without re-checking. The scale is preserved verbatim, and the projection
    accessors render the other scale at read time without ever mutating what was logged.
    """

    scale: EffortScale
    value: float

    def __post_init__(self) -> None:
        if self.scale is EffortScale.RPE:
            if not (RPE_MIN <= self.value <= RPE_MAX):
                raise ValueError(f"RPE must be between {RPE_MIN} and {RPE_MAX}")
            if (self.value / RPE_STEP) != int(self.value / RPE_STEP):
                raise ValueError("RPE allows only whole and half steps")
        elif self.scale is EffortScale.RIR:
            if self.value != int(self.value):
                raise ValueError("RIR must be a whole number")
            if not (RIR_MIN <= self.value <= RIR_MAX):
                raise ValueError(f"RIR must be between {RIR_MIN} and {RIR_MAX}")
        else:  # pragma: no cover - EffortScale is a closed enum
            raise ValueError(f"Unknown effort scale: {self.scale!r}")

    @property
    def as_rpe(self) -> float:
        """This effort as an RPE number: its own value on the RPE scale, or ``10 − rir``.

        The exact projection the Progression gate compares against ``LOW_EFFORT_MAX`` —
        so a logged RIR gates identically to the equivalent RPE (ADR-0066)."""

        return float(self.value) if self.scale is EffortScale.RPE else RPE_MAX - self.value

    @property
    def as_rir(self) -> float:
        """This effort as a (possibly fractional) reps-in-reserve number: its own value on
        the RIR scale, or ``10 − rpe``. Fractional for a half-step RPE — display rounds at
        the boundary, the same way the kg/lb projection rounds only when rendered."""

        return float(self.value) if self.scale is EffortScale.RIR else RPE_MAX - self.value

    def projected(self, scale: EffortScale) -> "Effort":
        """A new :class:`Effort` in ``scale`` — the read-time cross-scale projection.

        Projecting to the same scale returns ``self`` (an identity). Projecting to RPE
        carries the exact ``as_rpe`` value (always a valid half-step). Projecting to RIR
        rounds ``as_rir`` to the nearest integer and clamps it into the ``0–5`` band, since
        RIR admits only whole members and a "5+" ceiling — so the result is always a valid
        Effort, at the cost of the sub-integer precision RIR never carries anyway.
        """

        if scale is self.scale:
            return self
        if scale is EffortScale.RPE:
            return Effort(EffortScale.RPE, self.as_rpe)
        clamped = max(RIR_MIN, min(RIR_MAX, round(self.as_rir)))
        return Effort(EffortScale.RIR, float(clamped))

    def to_dict(self) -> dict:
        """The JSON-column representation: ``{"scale", "value"}``, with a whole value
        collapsed to an ``int`` so it stores as ``7`` / ``3`` rather than ``7.0``."""

        return {"scale": self.scale.value, "value": _format_value(self.value)}

    @classmethod
    def from_dict(cls, data: dict) -> "Effort":
        """Rebuild an ``Effort`` from its stored :meth:`to_dict` representation."""

        return cls(scale=EffortScale(data["scale"]), value=float(data["value"]))


def parse_effort(scale: str, value: str | float | int) -> Effort:
    """Interpret a raw scale + value into a typed :class:`Effort` — the strict boundary.

    Raises ``ValueError`` on an unknown scale, a value that is not a number, or a value
    outside the scale's valid band. The one place a write path turns an incoming request
    value into a validated Effort, so an invalid log is rejected (422) at the boundary
    rather than stored as a number whose meaning was guessed.
    """

    effort_scale = EffortScale(scale)
    number = float(value)
    return Effort(effort_scale, number)


def effort_from_input(
    scale: str | None, value: str | float | int | None
) -> Effort | None:
    """Build a typed Effort from the log form's scale picker plus its value field.

    A blank or absent value is *no effort* (``None``) — the set simply carries none, never
    a spurious zero — the same tolerance :func:`load.load_from_input` keeps for an empty
    load. When a value is present, an omitted scale defaults to RPE (an rpe-only client
    logs exactly as before). A present-but-invalid value still raises through
    :func:`parse_effort`, so the boundary can reject it.
    """

    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        value = stripped
    return parse_effort(scale or DEFAULT_EFFORT_SCALE.value, value)


def logged_effort_rpe(
    effort: dict | None, perceived_difficulty: int | None
) -> float | None:
    """A logged set's effort as an RPE number for the Progression gate (ADR-0066).

    The one seam the low-effort gate reads through, keeping the RIR→RPE normalization and
    the legacy fallback in a single place:

    - a typed ``effort`` dict wins and is normalized to its RPE-equivalent (a logged RIR
      becomes ``10 − rir``), so "3 RIR" gates identically to "RPE 7";
    - otherwise a returning user's legacy ``perceived_difficulty`` int reads as an
      ``rpe``-scale value, so existing records step exactly as before;
    - with neither present, there is no effort to gate on (``None``).
    """

    if effort is not None:
        return Effort.from_dict(effort).as_rpe
    if perceived_difficulty is not None:
        return float(perceived_difficulty)
    return None


__all__ = [
    "DEFAULT_EFFORT_SCALE",
    "Effort",
    "EffortScale",
    "effort_from_input",
    "logged_effort_rpe",
    "parse_effort",
]
