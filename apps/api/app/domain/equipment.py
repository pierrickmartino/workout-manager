"""Equipment — the curated read-time vocabulary behind the Catalog equipment facet (ADR-0077).

Equipment is free text everywhere it is entered: a Fitness Profile's Default / Available
Equipment and a catalog Exercise's required equipment are both free-form strings, so
"barbell" and "barbells" never merge, casing multiplies the facet, and an oddly specific
product name sits beside generic entries. This module is the fix: a **small, fixed set of
canonical Equipment** (never AI- or user-invented — the same species as Muscle Group and
Movement Pattern) plus a **curated alias map** that resolves each free-text string to its
canonical Equipment.

Two distinct jobs live here, and keeping them apart is the whole design:

- ``classify_equipment`` / ``canonical_equipment`` — a **read-time projection** for discovery
  and filtering (the same species as the Muscle Group roll-up and Movement Pattern, ADR-0072):
  every free-text string rolls up to a canonical token, and anything no alias claims collapses
  into the explicit ``OTHER`` ("Other") bucket rather than being dropped — the honesty twin of
  a movement's ``General``. Never a stored column; re-derived for free as strings change.
- ``normalize_stored_equipment`` — the **write-time normalization boundary** (ADR-0077,
  amended): when a *new* Exercise is minted, a mapped string is stored in its canonical form so
  the ``barbell``/``barbells``/``Floor`` proliferation never enters the shared catalog, while a
  string no alias claims is kept **verbatim** (never dropped) so a genuinely novel piece of kit
  survives and a later alias-map improvement can still re-bucket it. It reports the unmapped
  strings so the write boundary can log them as a tripwire.

Everything here is pure: no ORM, no HTTP, no logging (the caller owns the tripwire log). The
human label (Barbell, Pull-Up Bar…) is a presentation concern owned by the frontend
(``apps/web/lib/equipment.ts``), exactly as Movement Pattern splits token from label."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import Enum

_SEPARATORS = re.compile(r"[-_/]+")
_WHITESPACE = re.compile(r"\s+")


class Equipment(str, Enum):
    """A coarse, curated canonical piece of training kit an equipment string rolls up into.

    The value is the lowercase wire token the API emits and the facet/filter round-trips; the
    human label is the frontend's concern. ``OTHER`` is the honest "no alias claims this"
    bucket — the equipment twin of Movement Pattern's ``GENERAL`` and Muscle Group's
    ``UNCLASSIFIED`` — surfaced (never hidden) so a novel piece of kit still filters and
    displays under "Other" rather than vanishing (ADR-0077)."""

    BARBELL = "barbell"
    DUMBBELL = "dumbbell"
    KETTLEBELL = "kettlebell"
    BENCH = "bench"
    RACK = "rack"
    CABLE = "cable"
    MACHINE = "machine"
    RESISTANCE_BAND = "resistance band"
    PULL_UP_BAR = "pull-up bar"
    RINGS = "rings"
    PARALLETTES = "parallettes"
    SUSPENSION_TRAINER = "suspension trainer"
    MEDICINE_BALL = "medicine ball"
    BOX = "box"
    JUMP_ROPE = "jump rope"
    FOAM_ROLLER = "foam roller"
    CARDIO_MACHINE = "cardio machine"
    BODYWEIGHT = "bodyweight"
    OTHER = "other"


# Canonical presentation order: the real buckets roughly by commonality, with OTHER always
# last so the "everything else" bucket reads as a footnote, not a peer — the equipment twin of
# Movement Pattern's General-last order. Drives the facet's option order and per-exercise chips.
EQUIPMENT_ORDER: tuple[Equipment, ...] = (
    Equipment.BARBELL,
    Equipment.DUMBBELL,
    Equipment.KETTLEBELL,
    Equipment.BENCH,
    Equipment.RACK,
    Equipment.CABLE,
    Equipment.MACHINE,
    Equipment.RESISTANCE_BAND,
    Equipment.PULL_UP_BAR,
    Equipment.RINGS,
    Equipment.PARALLETTES,
    Equipment.SUSPENSION_TRAINER,
    Equipment.MEDICINE_BALL,
    Equipment.BOX,
    Equipment.JUMP_ROPE,
    Equipment.FOAM_ROLLER,
    Equipment.CARDIO_MACHINE,
    Equipment.BODYWEIGHT,
    Equipment.OTHER,
)

# Two-letter abbreviations, matched as a **whole word** (not a substring, so they never fire
# from inside an unrelated word). The ADR calls out "kettlebell"/"KB" as a genuine synonym a
# keyword map must fold — folding rules alone would miss it.
_ABBREVIATIONS: dict[str, Equipment] = {
    "kb": Equipment.KETTLEBELL,
    "db": Equipment.DUMBBELL,
}

# Name-keyword tables, checked in this priority order; the first bucket with a matching keyword
# wins, so order is load-bearing where a string could read two ways:
#   - Cardio machine before Machine, so "rowing machine" / "spin bike" beat the bare "machine".
#   - Cable before Machine, so "cable machine" reads as Cable.
#   - Pull-up bar before Barbell, so a "chin-up bar" is never swept up by a bar keyword.
# Keywords are matched as **substrings** of the separator-normalized string, so a trailing
# plural ("barbell" in "barbells") and a casing/spacing variant fold for free — the exact
# noise ADR-0077 exists to remove. Bare "bar" is deliberately absent so it never swallows
# "pull-up bar" or "dip bar".
_KEYWORDS: tuple[tuple[Equipment, tuple[str, ...]], ...] = (
    (
        Equipment.CARDIO_MACHINE,
        (
            "treadmill", "rowing machine", "row erg", "rower", "ski erg", "skierg",
            "erg", "elliptical", "stationary bike", "spin bike", "assault bike",
            "air bike", "airbike", "exercise bike", "bike", "stair", "stepper",
            "stairmaster",
        ),
    ),
    (Equipment.CABLE, ("cable", "pulley", "lat pulldown")),
    (
        Equipment.PULL_UP_BAR,
        ("pull up bar", "pullup bar", "chin up bar", "chinup bar"),
    ),
    (Equipment.KETTLEBELL, ("kettlebell", "kettle bell")),
    (Equipment.DUMBBELL, ("dumbbell", "dumb bell")),
    (
        Equipment.BARBELL,
        (
            "barbell", "bar bell", "ez bar", "ez curl", "curl bar", "olympic bar",
            "trap bar", "hex bar", "safety bar", "low bar", "high bar", "smith bar",
        ),
    ),
    (
        Equipment.SUSPENSION_TRAINER,
        ("suspension trainer", "suspension strap", "trx"),
    ),
    (
        Equipment.RESISTANCE_BAND,
        ("resistance band", "mini band", "loop band", "theraband", "power band", "band"),
    ),
    (Equipment.RINGS, ("gymnastic ring", "gym ring", "ring")),
    (
        Equipment.PARALLETTES,
        ("parallette", "parallel bar", "dip bar", "dip station", "p-bar"),
    ),
    (
        Equipment.MEDICINE_BALL,
        ("medicine ball", "med ball", "wall ball", "slam ball", "dead ball"),
    ),
    (Equipment.FOAM_ROLLER, ("foam roller", "foam roll")),
    (
        Equipment.JUMP_ROPE,
        ("jump rope", "jumprope", "skipping rope", "skip rope", "speed rope"),
    ),
    (Equipment.RACK, ("power rack", "squat rack", "half rack", "rack", "cage", "rig")),
    (Equipment.BENCH, ("bench",)),
    (Equipment.BOX, ("plyo box", "plyometric box", "jump box", "box")),
    (
        Equipment.MACHINE,
        (
            "machine", "leg press", "hack squat", "selectorized", "plate loaded",
            "smith",
        ),
    ),
    (
        Equipment.BODYWEIGHT,
        (
            "bodyweight", "body weight", "calisthenics", "no equipment", "none",
            "floor", "mat",
        ),
    ),
)


def _normalize(equipment: str) -> str:
    """Canonical match key: lowercased, separators folded to spaces, whitespace collapsed.

    Folding ``-``/``_``/``/`` to spaces lets one keyword ("pull up bar") match every spelling
    ("pull-up bar", "Pull_Up Bar"); the lowercase + whitespace collapse then makes casing and
    spacing noise irrelevant, so the alias map stays small.
    """

    lowered = _SEPARATORS.sub(" ", equipment.lower())
    return _WHITESPACE.sub(" ", lowered).strip()


def classify_equipment(equipment: str) -> Equipment:
    """Resolve one free-text equipment string to its canonical :class:`Equipment` (ADR-0077).

    A whole-word abbreviation ("KB" → Kettlebell) first, then the keyword table in priority
    order (substring match, so plurals and casing fold), else :data:`Equipment.OTHER`. A string
    is asserted into a bucket only when an alias actually claims it — an unknown or genuinely
    novel piece of kit stays ``OTHER`` rather than being forced into a group it does not belong
    to, exactly as an unmapped muscle stays Unclassified.
    """

    normalized = _normalize(equipment)
    if not normalized:
        return Equipment.OTHER

    words = set(normalized.split(" "))
    for abbreviation, bucket in _ABBREVIATIONS.items():
        if abbreviation in words:
            return bucket

    for bucket, keywords in _KEYWORDS:
        if any(keyword in normalized for keyword in keywords):
            return bucket

    return Equipment.OTHER


def canonical_equipment(values: Iterable[str]) -> list[Equipment]:
    """The distinct canonical Equipment a set of free-text strings rolls up into, ordered.

    The read-time projection behind the Catalog equipment facet and the per-exercise chips:
    each string is classified, duplicates collapse (so "barbell" and "barbells" read as one
    ``BARBELL``), and the result is returned in :data:`EQUIPMENT_ORDER` with ``OTHER`` last.
    Blank strings contribute nothing. Anything unmapped surfaces as the single ``OTHER`` bucket
    — disclosed, never dropped.
    """

    present = {classify_equipment(value) for value in values if value.strip()}
    return [bucket for bucket in EQUIPMENT_ORDER if bucket in present]


@dataclass(frozen=True)
class NormalizedEquipment:
    """The outcome of the write-time normalization boundary (ADR-0077, amended).

    ``values`` is the cleaned list to store: a mapped string in its canonical token form, an
    unmapped string kept **verbatim**, deduplicated with order preserved. ``unmapped`` is the
    verbatim strings that fell to ``OTHER`` — the tripwire payload the write boundary logs so a
    hallucinated or genuinely novel piece of kit entering the shared catalog is *seen*, without
    being rewritten or dropped. Frozen: a value object the caller never mutates.
    """

    values: list[str]
    unmapped: list[str]


def normalize_stored_equipment(values: Iterable[str]) -> NormalizedEquipment:
    """Normalize equipment strings for storage on a **newly minted** Exercise (ADR-0077).

    A mapped string is stored in its canonical token form ("Barbells" → ``barbell``, "Floor" →
    ``bodyweight``) so the casing/plural proliferation never enters the shared catalog; a string
    no alias claims is kept verbatim ("Atletica R8…" stays as typed) so nothing novel is silently
    dropped and a later alias-map improvement can still re-bucket it. Blank strings are dropped;
    duplicates collapse (both "Barbell" and "barbells" store one ``barbell``). Pure: it neither
    logs nor persists — it returns the cleaned list plus the unmapped strings for the caller to
    log as a tripwire.
    """

    seen: set[str] = set()
    stored: list[str] = []
    unmapped: list[str] = []
    for value in values:
        surface = _WHITESPACE.sub(" ", value.strip())
        if not surface:
            continue
        bucket = classify_equipment(surface)
        if bucket is Equipment.OTHER:
            key = surface.lower()
        else:
            key = surface = bucket.value
        if key in seen:
            continue
        seen.add(key)
        stored.append(surface)
        if bucket is Equipment.OTHER:
            unmapped.append(surface)
    return NormalizedEquipment(values=stored, unmapped=unmapped)


__all__ = [
    "Equipment",
    "EQUIPMENT_ORDER",
    "NormalizedEquipment",
    "classify_equipment",
    "canonical_equipment",
    "normalize_stored_equipment",
]
