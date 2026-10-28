"""Session Section — the read-time composition bucket of an Exercise Prescription.

A **Session Section** is *where a movement sits in the arc of one workout* — its
**warm-up**, **main work**, **accessory**, or **cooldown** — that a builder's composition
strip groups the Session by (creative-directions idea 5, ADR-0074). Like Movement Pattern
(``app.domain.movement_pattern``), Muscle Group, and Catalog Completeness, it is a
**read-time projection** over what the plan already carries — never a stored column, never
a migration, never an AI call per read — so it re-derives for free as a plan is edited.
Everything here is pure: no ORM, no HTTP.

It is honest about being a *heuristic*: unlike Movement Pattern (a property of one
Exercise in isolation), a Section is a property of a Prescription **in the ordered context
of its Session**, so ``sectionize`` reads the whole ordered list at once. The rules, in
order of strength:

- **Warm-up** — an explicit ``warm_up`` Set Type (ADR-0065, the strongest signal), or the
  *leading run* of mobility / dynamic-prep / cardio movements that opens a session.
- **Cooldown** — the *trailing run* of mobility / stretch / breathing movements (or trailing
  cardio done for time) that closes a session.
- **Main work** — the first :data:`MAIN_WORK_LIMIT` **compound** movements of the work block.
- **Accessory** — everything else in the work block: isolation and core movements, and
  compound movements past the main-work cap.

A **Superset** (ADR-0023) is performed as one block, so it is sectioned as one unit: it
takes one main-work slot when any member is compound, and every member then shares the
group's strongest section (main > accessory > warm-up > cooldown) — a core hold paired
with pull-ups and push-ups reads as main work alongside them, never split off.

Warm-up is only ever a leading run and cooldown only a trailing run, so the four sections
land as contiguous bands in session order — which is exactly how the composition strip reads
them. A movement no rule confidently claims falls to **accessory**, the neutral "supporting
work" bucket, rather than being forced into main work.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from enum import Enum
from typing import Protocol

from app.domain.set_type import is_warm_up

_WHITESPACE = re.compile(r"\s+")

#: How many leading **compound** movements read as main work; the rest of the work block
#: is accessory. Three is the common "a few main lifts, then supporting work" shape — a
#: deliberately simple, statable cap for a heuristic, not a claim about any one program.
MAIN_WORK_LIMIT = 3


class SessionSection(str, Enum):
    """Where one Exercise Prescription sits in the arc of its Session.

    The value is the lowercase wire token; the human label (Warm-up, Main work…) is a
    presentation concern owned by the frontend. There is no "general/unsectioned" bucket:
    every movement is part of *some* stretch of the workout, and an unclaimed one reads as
    :attr:`ACCESSORY` (supporting work) rather than a stray empty section.
    """

    WARM_UP = "warm_up"
    MAIN = "main"
    ACCESSORY = "accessory"
    COOLDOWN = "cooldown"


#: Canonical presentation order — the arc of a session, warm-up first to cooldown last.
SECTION_ORDER: tuple[SessionSection, ...] = (
    SessionSection.WARM_UP,
    SessionSection.MAIN,
    SessionSection.ACCESSORY,
    SessionSection.COOLDOWN,
)


class _Sectionable(Protocol):
    """The Prescription fields the classifier reads.

    Typed structurally so both a ``PrescriptionView`` and a test double satisfy it — the
    same idiom as ``_Classifiable`` in ``movement_pattern``. ``prescribed_quantity`` is the
    stored ``Quantity`` dict (or ``None``); only its ``kind`` is read here.
    ``superset_group`` is the Superset tag (ADR-0023), ``None`` when solo.
    """

    exercise_name: str
    set_type: str | None
    prescribed_quantity: dict | None
    superset_group: str | None


# Compound, multi-joint movements — the main-work candidates. Kept to distinctive stems so
# a substring match is safe ("press" catches bench/overhead/leg press). Checked *after*
# isolation, so an isolation name that happens to contain a compound stem still reads as
# accessory.
_COMPOUND_KEYWORDS: tuple[str, ...] = (
    "squat", "deadlift", "rdl", "romanian", "hinge", "hip thrust", "lunge",
    "split squat", "step-up", "step up", "leg press", "bench", "press", "dip",
    "push-up", "pushup", "push up", "row", "pull-up", "pullup", "pull up", "chin-up",
    "chinup", "chin up", "pulldown", "lat pull", "clean", "snatch", "jerk", "thruster",
    "good morning", "hack squat", "front squat", "back squat", "overhead",
)

# Isolation, single-joint movements — always accessory, whatever their position. Checked
# first so "face pull" / "leg extension" never read as a compound pull/press.
_ISOLATION_KEYWORDS: tuple[str, ...] = (
    "curl", "extension", "raise", "fly", "flye", "face pull", "kickback", "pushdown",
    "push-down", "shrug", "pec deck", "calf", "lateral", "rear delt", "reverse fly",
    "reverse flye", "cable cross", "crossover", "concentration", "preacher", "cuban",
    "pull-apart", "pull apart",
)

# Core / trunk movements — accessory on their own, like isolation, and checked before the
# compound stems so "Pallof press" never reads as a main-work press. Inside a Superset they
# ride with their group's section.
_CORE_KEYWORDS: tuple[str, ...] = (
    "hollow", "plank", "dead bug", "bird dog", "pallof", "l-sit", "l sit", "ab wheel",
    "rollout", "crunch", "sit-up", "situp", "sit up", "v-up", "russian twist",
    "side bend", "dragon flag", "toes to bar", "toes-to-bar",
)

# Mobility / stretch movements — warm-up when they *open* a session, cooldown when they
# *close* it (position decides, in ``sectionize``).
_MOBILITY_KEYWORDS: tuple[str, ...] = (
    "stretch", "mobility", "foam roll", "foamroll", "world's greatest", "worlds greatest",
    "cat-cow", "cat cow", "pigeon", "child's pose", "childs pose", "cobra",
    "downward dog", "couch stretch", "hip opener", "thoracic", "scapular", "wall slide",
    "hip circle", "leg swing", "arm circle",
)

# Dynamic prep / activation drills — warm-up only.
_WARM_UP_KEYWORDS: tuple[str, ...] = (
    "warm-up", "warmup", "warm up", "activation", "inchworm", "jumping jack",
    "high knee", "butt kick", "a-skip", "b-skip", "dynamic",
)

# Conditioning / cardio machines and drills — warm-up when leading; cooldown when trailing
# and done for time.
_CARDIO_KEYWORDS: tuple[str, ...] = (
    "run", "sprint", "jog", "treadmill", "row erg", "erg", "assault bike", "bike", "cycl",
    "spin", "elliptical", "ski erg", "skierg", "jump rope", "burpee", "mountain climber",
    "stair", "shuttle",
)

# Down-regulation / breathing — cooldown only.
_BREATHING_KEYWORDS: tuple[str, ...] = (
    "breathing", "savasana", "meditation", "cool-down", "cooldown", "cool down",
)

_DURATION_KINDS = frozenset({"duration", "distance"})


def _normalize(text: str) -> str:
    """Canonical match key: lowercased, trimmed, internal whitespace collapsed."""

    return _WHITESPACE.sub(" ", text.strip()).lower()


def _contains_any(name: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in name for keyword in keywords)


def _is_for_time(prescribed_quantity: dict | None) -> bool:
    """Whether the prescription is targeted by duration/distance rather than reps.

    A trailing cardio movement done *for time* reads as a cooldown; a rep-target cardio
    finisher does not. Total on any non-dict / missing kind, so a malformed value never
    raises on a read.
    """

    if not isinstance(prescribed_quantity, dict):
        return False
    return prescribed_quantity.get("kind") in _DURATION_KINDS


def _is_warm_up_like(item: _Sectionable) -> bool:
    """Whether a movement reads as warm-up material (explicit type, or prep/cardio name)."""

    if is_warm_up(item.set_type):
        return True
    name = _normalize(item.exercise_name)
    return (
        _contains_any(name, _WARM_UP_KEYWORDS)
        or _contains_any(name, _MOBILITY_KEYWORDS)
        or _contains_any(name, _CARDIO_KEYWORDS)
    )


def reads_as_warm_up_drill(exercise_name: str) -> bool:
    """Whether a movement's name reads as warm-up drill material: dynamic prep, activation
    or mobility work. The catalog-first filter for a Warm-up Suggestion's candidates
    (ADR-0143) reads the same vocabulary the Warm-up Section does, so a reused catalog drill
    is one this projection would also section as warm-up."""

    name = _normalize(exercise_name)
    return _contains_any(name, _WARM_UP_KEYWORDS) or _contains_any(name, _MOBILITY_KEYWORDS)


def _is_cooldown_like(item: _Sectionable) -> bool:
    """Whether a movement reads as cooldown material (stretch / breathing / timed cardio)."""

    name = _normalize(item.exercise_name)
    if _contains_any(name, _MOBILITY_KEYWORDS) or _contains_any(name, _BREATHING_KEYWORDS):
        return True
    return _contains_any(name, _CARDIO_KEYWORDS) and _is_for_time(item.prescribed_quantity)


def _is_main_candidate(item: _Sectionable) -> bool:
    """Whether a work-block movement is compound (and not isolation/core) — main-work material."""

    name = _normalize(item.exercise_name)
    if _contains_any(name, _ISOLATION_KEYWORDS) or _contains_any(name, _CORE_KEYWORDS):
        return False
    return _contains_any(name, _COMPOUND_KEYWORDS)


def _units(items: Sequence[_Sectionable]) -> list[list[int]]:
    """Split the ordered positions into units: a solo movement, or a contiguous Superset run."""

    units: list[list[int]] = []
    for index, item in enumerate(items):
        group = getattr(item, "superset_group", None)
        previous = units[-1] if units else None
        if (
            group is not None
            and previous is not None
            and getattr(items[previous[-1]], "superset_group", None) == group
        ):
            previous.append(index)
        else:
            units.append([index])
    return units


# Which section a split Superset settles on: the working part of the block wins.
_UNIT_STRENGTH: dict[SessionSection, int] = {
    SessionSection.MAIN: 3,
    SessionSection.ACCESSORY: 2,
    SessionSection.WARM_UP: 1,
    SessionSection.COOLDOWN: 0,
}


def sectionize(items: Sequence[_Sectionable]) -> list[SessionSection]:
    """Assign each Prescription in a Session, in order, to its Session Section (ADR-0074).

    A pure read-time projection over the ordered prescriptions. Warm-up is the leading run
    of prep material (or any explicit ``warm_up`` Set Type); cooldown is the trailing run
    of down-regulation material; the work block between them is main work for its first
    :data:`MAIN_WORK_LIMIT` compound movements and accessory for the rest. A Superset is
    one unit: one main-work slot, and one shared section for all its members. Returns one
    section per input, in input order.
    """

    count = len(items)
    sections: list[SessionSection | None] = [None] * count

    # Explicit warm-up Set Type wins wherever it sits (the strongest signal).
    for index, item in enumerate(items):
        if is_warm_up(item.set_type):
            sections[index] = SessionSection.WARM_UP

    # Leading warm-up run: extend from the start over prep/cardio material (and any
    # warm-up-typed set already marked at the front).
    lead = 0
    while lead < count and (
        sections[lead] is SessionSection.WARM_UP or _is_warm_up_like(items[lead])
    ):
        sections[lead] = SessionSection.WARM_UP
        lead += 1

    # Trailing cooldown run: extend from the end over down-regulation material, never
    # consuming a movement already claimed by the warm-up.
    tail = count - 1
    while tail >= 0 and sections[tail] is None and _is_cooldown_like(items[tail]):
        sections[tail] = SessionSection.COOLDOWN
        tail -= 1

    # Work block, unit by unit (a solo movement or a whole Superset): the first
    # MAIN_WORK_LIMIT units holding a compound movement are main work; isolation, core and
    # any remaining/ambiguous movement fall to accessory.
    units = _units(items)
    main_count = 0
    for unit in units:
        free = [index for index in unit if sections[index] is None]
        if not free:
            continue
        is_main = main_count < MAIN_WORK_LIMIT and any(
            _is_main_candidate(items[index]) for index in free
        )
        if is_main:
            main_count += 1
        section = SessionSection.MAIN if is_main else SessionSection.ACCESSORY
        for index in free:
            sections[index] = section

    # A Superset is one block: every member shares the group's strongest section.
    resolved = [section or SessionSection.ACCESSORY for section in sections]
    for unit in units:
        strongest = max((resolved[index] for index in unit), key=_UNIT_STRENGTH.__getitem__)
        for index in unit:
            resolved[index] = strongest
    return resolved


__all__ = [
    "MAIN_WORK_LIMIT",
    "SECTION_ORDER",
    "SessionSection",
    "reads_as_warm_up_drill",
    "sectionize",
]
