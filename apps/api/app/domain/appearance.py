"""Appearance domain: the per-user Interface Preference (Mode + Keep Screen Awake
+ Weight Unit).

The user's per-account UI choices are an **Interface Preference** (ADR-0055):
read-time state that steers how the app *presents or behaves* for them and is
deliberately kept apart from the Fitness Profile (ADR-0047), so it never enters
generation or the cache key. Its members are the **Mode** (the appearance facet
— an *Appearance Preference*), whether to **Keep Screen Awake** during a Live
Session, and the **Weight Unit** a Load is entered and displayed in. This module
owns the domain facts of that preference: the closed sets a user may choose and
the shipped defaults for every member.

``Mode`` is the user's chosen surface polarity (CONTEXT "Mode"); ``system``
means *follow the device*, resolved client-side via ``prefers-color-scheme``
rather than stored as a concrete polarity. **Keep Screen Awake** is the
behavioural facet (CONTEXT "Keep Screen Awake"). **Weight Unit** (CONTEXT
"Weight Unit") steers only how a Load's kilogram value is entered and displayed —
storage stays canonical kilograms — so it too never reaches generation or the
cache key. Absence of a stored preference defaults to Dark + Keep-Screen-Awake on
+ kilograms, so existing users are never disturbed on deploy (ADR-0047,
ADR-0055)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Mode(str, Enum):
    """The closed set of Modes a user may choose.

    A constrained vocabulary stored as its raw value (like ``Gender``): the
    picker only ever offers these three, and an unknown Mode is a boundary
    validation error, never persisted."""

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


# The shipped default when a user has no Appearance Preference yet. Dark
# preserves today's all-dark PULSE look (ADR-0047); the web ``DEFAULT_MODE`` in
# apps/web/lib/theme.ts mirrors this exact choice.
DEFAULT_MODE: Mode = Mode.DARK

# The shipped default for the **Keep Screen Awake** facet of the Interface
# Preference: on, matching the expected gym behaviour so the screen stays on
# during a Live Session without a user first discovering the toggle (ADR-0055).
# Mirrors how ``DEFAULT_MODE`` is the domain constant for the Mode facet.
DEFAULT_KEEP_SCREEN_AWAKE: bool = True


class WeightUnit(str, Enum):
    """The closed set of Weight Units a user may choose (CONTEXT "Weight Unit").

    A constrained vocabulary stored as its raw value (like ``Mode``): the toggle
    only ever offers kilograms or pounds, and an unknown unit is a boundary
    validation error, never persisted. The choice steers only how a Load and a
    Performed Body Weight are *entered and displayed*; storage stays canonical
    kilograms, so this never enters generation or the cache key."""

    KG = "kg"
    LB = "lb"


# The shipped default when a user has no Weight Unit preference yet: kilograms,
# the app's canonical storage unit, so existing behaviour is unchanged (CONTEXT
# "Weight Unit"). The web ``DEFAULT_WEIGHT_UNIT`` mirrors this exact choice.
DEFAULT_WEIGHT_UNIT: WeightUnit = WeightUnit.KG


@dataclass(frozen=True)
class InterfacePreference:
    """A user's whole Interface Preference: Mode, Keep-Screen-Awake, and Weight Unit.

    Read and written as one immutable value so the repository upserts the whole
    preference rather than proliferating a method pair per member (ADR-0055).
    Defaults to the shipped Dark + Keep-Screen-Awake-on + kilograms, so a
    get-or-default read for a user with no stored row yields
    ``InterfacePreference()`` — never an error. Frozen: change a facet with
    ``dataclasses.replace``, never in place."""

    mode: Mode = DEFAULT_MODE
    keep_screen_awake: bool = DEFAULT_KEEP_SCREEN_AWAKE
    weight_unit: WeightUnit = DEFAULT_WEIGHT_UNIT

    def with_overrides(
        self,
        *,
        mode: Mode | None = None,
        keep_screen_awake: bool | None = None,
        weight_unit: WeightUnit | None = None,
    ) -> "InterfacePreference":
        """Return a copy with only the supplied facets replaced (``None`` leaves as-is).

        Lets a caller change one facet of the whole preference — the Mode picker, the
        Keep-Screen-Awake toggle, or the Weight-Unit toggle each saving only their
        own — without disturbing the others. Returns a new value; never mutates in
        place."""

        return InterfacePreference(
            mode=self.mode if mode is None else mode,
            keep_screen_awake=(
                self.keep_screen_awake
                if keep_screen_awake is None
                else keep_screen_awake
            ),
            weight_unit=self.weight_unit if weight_unit is None else weight_unit,
        )


# The get-or-default value served when a user has no stored Interface Preference.
DEFAULT_INTERFACE_PREFERENCE: InterfacePreference = InterfacePreference()


__all__ = [
    "Mode",
    "DEFAULT_MODE",
    "DEFAULT_KEEP_SCREEN_AWAKE",
    "WeightUnit",
    "DEFAULT_WEIGHT_UNIT",
    "InterfacePreference",
    "DEFAULT_INTERFACE_PREFERENCE",
]
