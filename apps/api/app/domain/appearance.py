"""Appearance domain: the per-user Interface Preference (Mode + Keep Screen Awake).

The user's per-account UI choices are an **Interface Preference** (ADR-0055):
read-time state that steers how the app *presents or behaves* for them and is
deliberately kept apart from the Fitness Profile (ADR-0047), so it never enters
generation or the cache key. Its members are the **Mode** (the appearance facet
— an *Appearance Preference*) and whether to **Keep Screen Awake** during a Live
Session. This module owns the domain facts of that preference: the closed set of
Modes a user may choose and the shipped defaults for both members.

``Mode`` is the user's chosen surface polarity (CONTEXT "Mode"); ``system``
means *follow the device*, resolved client-side via ``prefers-color-scheme``
rather than stored as a concrete polarity. **Keep Screen Awake** is the
behavioural facet (CONTEXT "Keep Screen Awake"). Absence of a stored preference
defaults to Dark + Keep-Screen-Awake on, so existing users are never disturbed
on deploy (ADR-0047, ADR-0055)."""

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


@dataclass(frozen=True)
class InterfacePreference:
    """A user's whole Interface Preference: their Mode and Keep-Screen-Awake choice.

    Read and written as one immutable value so the repository upserts the whole
    preference rather than proliferating a method pair per member (ADR-0055).
    Defaults to the shipped Dark + Keep-Screen-Awake-on, so a get-or-default read
    for a user with no stored row yields ``InterfacePreference()`` — never an
    error. Frozen: change a facet with ``dataclasses.replace``, never in place."""

    mode: Mode = DEFAULT_MODE
    keep_screen_awake: bool = DEFAULT_KEEP_SCREEN_AWAKE

    def with_overrides(
        self,
        *,
        mode: Mode | None = None,
        keep_screen_awake: bool | None = None,
    ) -> "InterfacePreference":
        """Return a copy with only the supplied facets replaced (``None`` leaves as-is).

        Lets a caller change one facet of the whole preference — the Mode picker or
        the Keep-Screen-Awake toggle each saving only their own — without disturbing
        the other. Returns a new value; never mutates in place."""

        return InterfacePreference(
            mode=self.mode if mode is None else mode,
            keep_screen_awake=(
                self.keep_screen_awake
                if keep_screen_awake is None
                else keep_screen_awake
            ),
        )


# The get-or-default value served when a user has no stored Interface Preference.
DEFAULT_INTERFACE_PREFERENCE: InterfacePreference = InterfacePreference()


__all__ = [
    "Mode",
    "DEFAULT_MODE",
    "DEFAULT_KEEP_SCREEN_AWAKE",
    "InterfacePreference",
    "DEFAULT_INTERFACE_PREFERENCE",
]
