"""Behavior of the Progression domain module: the deterministic, no-AI
``next_load`` adjustment (ADR-0004). It is a pure function over a prescription and
the user's Logged Sets — strong performance nudges the recommended load up, missed
reps back it off, and anything it cannot read numerically is left untouched. No
mocks: the inputs are plain stubs."""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.domain.load import LoadKind, parse_load
from app.domain.progression import (
    DEFAULT_SCHEME,
    RESET_FRACTION,
    SESSION_COUNT_N,
    ProgressionKind,
    ProgressionScheme,
    next_load,
    next_prescription,
    parse_rep_range,
    pin_offer,
    resolve_scheme,
    scheme_applies_to,
    scheme_applies_to_load,
)
from app.domain.quantity import Quantity, QuantityKind
from tests.quantities import reps_quantity


@dataclass
class _Prescription:
    """Minimal stand-in carrying only what ``next_load`` reads off a prescription."""

    reps: str
    recommended_load: str | None


@dataclass
class _LoggedSet:
    """Minimal stand-in for one performed set.

    Built from an ergonomic ``reps`` int, but exposes the typed ``quantity`` the
    progression actually reads through (ADR-0032) — so these tests stay readable while
    exercising the real Quantity accessor path."""

    reps: int
    perceived_difficulty: int | None = None

    @property
    def quantity(self) -> dict:
        return reps_quantity(self.reps)


def test_no_logged_sets_holds_the_recommended_load():
    # Arrange — nothing performed yet
    prescription = _Prescription(reps="5", recommended_load="60 kg")

    # Act
    result = next_load(prescription, [])

    # Assert — with no evidence to act on, the recommendation is unchanged
    assert result == "60 kg"


def test_all_reps_hit_at_low_effort_increases_the_load():
    # Arrange — every set met the target and felt easy
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — strong performance bumps the recommended load up
    assert result == "62.5 kg"


def test_missed_reps_reduce_the_load():
    # Arrange — the user fell short of the prescribed reps on a set
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [
        _LoggedSet(reps=5, perceived_difficulty=8),
        _LoggedSet(reps=3, perceived_difficulty=9),
    ]

    # Act
    result = next_load(prescription, sets)

    # Assert — missing reps backs the recommended load off
    assert result == "55 kg"


def test_reps_hit_at_high_effort_holds_the_load():
    # Arrange — every rep made, but it was a grind
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=9) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — hard sets hold; only easy ones earn more load
    assert result == "60 kg"


def test_missing_perceived_effort_holds_rather_than_increases():
    # Arrange — reps hit, but the user did not record effort
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=None) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — without evidence the work was easy, the load only holds
    assert result == "60 kg"


def test_a_rep_range_increases_only_when_the_ceiling_is_reached():
    # Arrange — top of an 8–12 range at low effort
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — double-progression: ceiling reached → step the load up
    assert result == "42.5 kg"


def test_a_rep_range_holds_in_the_middle_of_the_range():
    # Arrange — within the range (>= floor, < ceiling)
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [_LoggedSet(reps=10, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — keep accumulating reps before adding load
    assert result == "40 kg"


def test_a_rep_range_reduces_when_a_set_drops_below_the_floor():
    # Arrange — a set fell under the bottom of the 8–12 range
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [
        _LoggedSet(reps=12, perceived_difficulty=7),
        _LoggedSet(reps=7, perceived_difficulty=9),
    ]

    # Act
    result = next_load(prescription, sets)

    # Assert
    assert result == "35 kg"


def test_a_load_with_no_unit_is_adjusted_numerically():
    # Arrange — a bare number
    prescription = _Prescription(reps="5", recommended_load="60")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert — the number moves, the (empty) suffix is preserved
    assert next_load(prescription, sets) == "62.5"


def test_a_load_with_a_glued_unit_preserves_its_formatting():
    # Arrange — no space between number and unit
    prescription = _Prescription(reps="5", recommended_load="60kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "62.5kg"


def test_a_non_numeric_load_is_left_untouched():
    # Arrange — bodyweight movement: nothing to add a kilo to
    prescription = _Prescription(reps="5", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "bodyweight"


def test_a_percentage_load_is_left_untouched():
    # Arrange — a %-1RM load has digits in its suffix; refuse to guess
    prescription = _Prescription(reps="5", recommended_load="70% 1RM")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "70% 1RM"


def test_a_range_valued_load_is_left_untouched():
    # Arrange — "70-80 kg" has no single number to move
    prescription = _Prescription(reps="5", recommended_load="70-80 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "70-80 kg"


def test_an_unparseable_rep_target_holds_the_load():
    # Arrange — "AMRAP" gives no numeric target to judge against
    prescription = _Prescription(reps="AMRAP", recommended_load="60 kg")
    sets = [_LoggedSet(reps=20, perceived_difficulty=6)]

    # Act / Assert
    assert next_load(prescription, sets) == "60 kg"


def test_a_null_load_stays_null():
    # Arrange — no recommendation to adjust
    prescription = _Prescription(reps="5", recommended_load=None)
    sets = [_LoggedSet(reps=5, perceived_difficulty=6)]

    # Act / Assert
    assert next_load(prescription, sets) is None


def test_a_reduction_never_drops_below_zero():
    # Arrange — a light load with missed reps
    prescription = _Prescription(reps="5", recommended_load="2 kg")
    sets = [_LoggedSet(reps=1, perceived_difficulty=10)]

    # Act / Assert — clamped at zero, never negative
    assert next_load(prescription, sets) == "0 kg"


# --- next_prescription: the typed result over every load kind (ADR-0026) ---


def test_next_prescription_reports_an_absolute_load_step():
    # Arrange — strong performance on an external-weight prescription
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — a typed result tagged as a load step with the stepped kg and
    # the (unchanged) rep target carried through
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "62.5 kg"
    assert result.reps == "5"


def test_weighted_bodyweight_all_reps_at_low_effort_steps_the_added_load():
    # Arrange — a belt-loaded dip: bodyweight plus 10 kg, every rep hit easily
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 10 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — the *added* kilograms step up with the same increment as an
    # external-weight load; the movement stays bodyweight
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 12.5 kg"
    assert result.reps == "5"


def test_weighted_bodyweight_missed_reps_steps_the_added_load_down():
    # Arrange — fell short of the prescribed reps on a weighted dip
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 10 kg")
    sets = [
        _LoggedSet(reps=5, perceived_difficulty=8),
        _LoggedSet(reps=3, perceived_difficulty=9),
    ]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — the added kilograms back off, same larger decrement as a bare load
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 5 kg"


def test_weighted_bodyweight_reduction_collapses_to_pure_bodyweight_at_zero():
    # Arrange — a light belt load with a badly missed set
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 2.5 kg")
    sets = [_LoggedSet(reps=1, perceived_difficulty=10)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — clamped at zero: the added load is gone, leaving the movement bodyweight
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight"


def test_pure_bodyweight_strong_performance_steps_the_rep_target_up():
    # Arrange — pull-ups at bodyweight, 8–12 target, top of the range hit easily.
    # No weight to add, so the rep target itself must advance.
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — the target tightens toward the ceiling by raising the floor; the
    # movement (bodyweight) is unchanged
    assert result.kind is ProgressionKind.REPS_STEP
    assert result.reps == "9-12"
    assert result.recommended_load == "bodyweight"


def test_pure_bodyweight_at_the_ceiling_suggests_a_harder_variation():
    # Arrange — the floor has already climbed to the top of the range and the top
    # is still hit easily: there is nowhere left for reps to grow
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — no unbounded rep growth: the prescription holds unchanged, but a
    # harder-Variation suggestion is raised instead of silently stalling (ADR-0026)
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "12-12"
    assert result.recommended_load == "bodyweight"
    assert result.suggest_harder_variation is True


def test_pure_bodyweight_at_the_ceiling_at_high_effort_holds_without_suggesting():
    # Arrange — at the ceiling, but the top set was a grind
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=9) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — a hard ceiling set has not earned a harder movement yet; plain hold
    assert result.kind is ProgressionKind.HOLD
    assert result.suggest_harder_variation is False


def test_single_rep_target_pure_bodyweight_suggests_at_the_ceiling():
    # Arrange — a fixed 5-rep bodyweight target (floor == ceiling) hit easily
    prescription = _Prescription(reps="5", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — a single-value target is already at its ceiling, so strong work
    # offers the harder Variation rather than inventing a range to grow into
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "5"
    assert result.suggest_harder_variation is True


def test_reps_step_below_the_ceiling_does_not_suggest_a_harder_variation():
    # Arrange — mid-range pure bodyweight, top hit easily but room to grow reps
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — reps step up first; no suggestion until the ceiling is reached
    assert result.kind is ProgressionKind.REPS_STEP
    assert result.reps == "9-12"
    assert result.suggest_harder_variation is False


def test_absolute_load_step_never_suggests_a_harder_variation():
    # Arrange — an external-weight prescription steps load, not movement
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — the harder-Variation signal is a pure-bodyweight-only concern
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.suggest_harder_variation is False


def test_pure_bodyweight_missed_reps_leaves_the_prescription_untouched():
    # Arrange — fell short of the target floor on pure bodyweight
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=5, perceived_difficulty=9) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — reps never step *down*; the prescription is left as-is to be retried
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "8-12"
    assert result.recommended_load == "bodyweight"


def test_next_prescription_holds_a_load_with_no_single_clean_value():
    # Arrange — a %-1RM load has no single kilogram value to step, and is not
    # bodyweight; there is nothing to move
    prescription = _Prescription(reps="5", recommended_load="70% 1RM")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — untouched, reported as a hold
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "5"
    assert result.recommended_load == "70% 1RM"


def test_next_prescription_holds_a_qualitative_load():
    # Arrange — a qualitative effort load carries no number to step and is not bodyweight
    prescription = _Prescription(reps="5", recommended_load="moderate")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — left untouched
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "moderate"


def test_weighted_bodyweight_reps_hit_at_high_effort_holds_the_added_load():
    # Arrange — every rep made on a weighted dip, but it was a grind
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 10 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=9) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets)

    # Assert — hard sets hold; only easy ones earn more added load
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "bodyweight + 10 kg"


# --- Pinned-target range validation (parse_rep_range, ADR-0053) --------------------
# The boundary check for a user-chosen Pinned Target: a sane, non-empty range with
# floor <= ceiling is accepted (single stays single, range stays a range); anything
# reversed, non-positive, or free text is rejected so a nonsensical pin can't be saved.


@pytest.mark.parametrize(
    "text, expected",
    [
        ("12", (12, 12)),       # a single number is a degenerate range
        ("10-14", (10, 14)),    # a floor..ceiling range
        ("8-8", (8, 8)),        # floor == ceiling is allowed
        (" 10 - 14 ", (10, 14)),  # surrounding/interior whitespace tolerated
    ],
)
def test_parse_rep_range_accepts_sane_targets(text, expected):
    assert parse_rep_range(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "14-10",   # reversed: floor > ceiling
        "0",       # zero reps is not a target
        "0-5",     # a zero floor
        "-3",      # negative
        "AMRAP",   # free text
        "",        # empty
        "8-12-15",  # malformed
    ],
)
def test_parse_rep_range_rejects_nonsensical_targets(text):
    assert parse_rep_range(text) is None


# --- pin_offer: the Pin offer predicate + proposed pre-fill range (issue #370) ------
# A pure-bodyweight Prescription qualifies to be *offered* a Pin only when every
# working Logged Set beat the *top* of the rep range — strictly above the ceiling on
# all sets, so a single fluke can't ossify the target. Unlike Progression's own step,
# it is NOT gated on perceived effort: the human confirmation dialog replaces the
# low-RPE gate. When offered, ``pin_offer`` returns the range to pre-fill, keeping the
# prescription's existing shape (single→single, range→range) and derived from the reps
# performed; when not offered it returns ``None``.


def _bodyweight_sets(reps_and_effort):
    """Build Logged Sets from ``(reps, perceived_difficulty)`` pairs."""

    return [
        _LoggedSet(reps=reps, perceived_difficulty=effort)
        for reps, effort in reps_and_effort
    ]


@pytest.mark.parametrize(
    "reps, load, performed, proposed",
    [
        # Range target, every set strictly above the 12 ceiling → offered; the
        # pre-fill spans the performed floor..ceiling, keeping the range shape.
        ("8-12", "bodyweight", [(13, 6), (14, 6), (15, 6)], "13-15"),
        # Single-number target stays single, collapsing to the reliable floor performed.
        ("5", "bodyweight", [(8, 6), (8, 6), (9, 6)], "8"),
        # Effort is ignored: a high-RPE grind that still beat the ceiling is offered.
        ("8-12", "bodyweight", [(13, 10), (14, 10)], "13-14"),
        # Every set the same, above the ceiling: a range collapses to a "n-n" range.
        ("8-12", "bodyweight", [(15, 6), (15, 6)], "15-15"),
        # Single target: the proposed single is the min performed, not the max spike.
        ("10", "bodyweight", [(12, 6), (20, 6)], "12"),
        # "bw" shorthand is still pure bodyweight (parse_load reads it) → offered.
        ("8-12", "bw", [(13, 6), (14, 6)], "13-14"),
    ],
)
def test_pin_offer_is_made_with_a_proposed_range(reps, load, performed, proposed):
    # Arrange
    prescription = _Prescription(reps=reps, recommended_load=load)
    sets = _bodyweight_sets(performed)

    # Act
    offer = pin_offer(prescription, sets)

    # Assert — offered, with the pre-fill derived from performed reps
    assert offer is not None
    assert offer.proposed_reps == proposed


@pytest.mark.parametrize(
    "reps, load, performed",
    [
        # A set at the ceiling (not strictly above) disqualifies the whole session.
        ("8-12", "bodyweight", [(13, 6), (12, 6)]),
        # A set below the ceiling disqualifies it too.
        ("8-12", "bodyweight", [(13, 6), (10, 6)]),
        # Met the floor only (nothing above the ceiling) → not "more than the plan".
        ("8-12", "bodyweight", [(8, 6), (9, 6)]),
        # Single target hit exactly (at its ceiling, not above) → not offered.
        ("5", "bodyweight", [(5, 6), (5, 6)]),
        # Non-bodyweight (absolute) load: reps are not the progression axis.
        ("8-12", "40 kg", [(13, 6), (14, 6)]),
        # Weighted bodyweight (added load): the added kilograms are the axis, not reps.
        ("8-12", "bodyweight + 10 kg", [(13, 6), (14, 6)]),
        # A %-1RM load is not bodyweight → not offered.
        ("8-12", "70% 1RM", [(13, 6), (14, 6)]),
        # A qualitative load is not bodyweight → not offered.
        ("8-12", "moderate", [(13, 6)]),
        # An unparseable rep target has no ceiling to beat → not offered.
        ("AMRAP", "bodyweight", [(20, 6)]),
        # No logged sets: nothing was performed, so nothing to offer.
        ("8-12", "bodyweight", []),
    ],
)
def test_pin_offer_is_withheld(reps, load, performed):
    # Arrange
    prescription = _Prescription(reps=reps, recommended_load=load)
    sets = _bodyweight_sets(performed)

    # Act / Assert — no offer for anything that isn't "beat the ceiling on every set"
    assert pin_offer(prescription, sets) is None


def test_pin_offer_is_withheld_when_a_null_load_cannot_be_typed():
    # Arrange — a Prescription with no recommended load has nothing to type as bodyweight
    prescription = _Prescription(reps="8-12", recommended_load=None)
    sets = _bodyweight_sets([(13, 6), (14, 6)])

    # Act / Assert
    assert pin_offer(prescription, sets) is None


def test_pin_offer_is_withheld_when_a_set_carries_no_reps():
    # Arrange — a duration set (a hold) has no rep count, so it can't be "above the
    # ceiling"; its presence disqualifies the session even beside rep sets that beat it
    @dataclass
    class _HoldSet:
        perceived_difficulty: int | None = 6

        @property
        def quantity(self) -> dict:
            return Quantity(
                kind=QuantityKind.DURATION, text="60s", seconds=60.0
            ).to_dict()

    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=13, perceived_difficulty=6), _HoldSet()]

    # Act / Assert
    assert pin_offer(prescription, sets) is None


# --- Progression Scheme registry (ADR-0064, #428) ----------------------------------
# ``next_prescription`` dispatches through a closed registry of schemes. The default
# scheme is Double Progression — the existing engine — so every current caller is
# unchanged. Static never auto-steps. A compatibility predicate answers whether a
# scheme applies to a Load kind, and no scheme ever auto-swaps a movement.


def test_the_default_scheme_is_double_progression():
    # Assert — an omitted scheme resolves to today's engine, keeping plans unaffected
    assert DEFAULT_SCHEME is ProgressionScheme.DOUBLE_PROGRESSION


def test_the_scheme_catalog_is_the_closed_v1_landing_set():
    # Assert — the complete, closed v1 catalog (ADR-0064): the two universal defaults,
    # Greyskull-style Linear (#430), and Session-Count-Based (#431).
    assert {scheme.value for scheme in ProgressionScheme} == {
        "double_progression",
        "static",
        "greyskull",
        "session_count",
    }


def test_omitting_the_scheme_reproduces_double_progression():
    # Arrange — strong performance on an external-weight prescription
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act — calling with no scheme argument (the existing call shape)
    result = next_prescription(prescription, sets)

    # Assert — identical to explicitly selecting Double Progression
    assert result == next_prescription(
        prescription, sets, ProgressionScheme.DOUBLE_PROGRESSION
    )
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "62.5 kg"


def test_explicit_double_progression_still_backs_off_on_a_miss():
    # Arrange — a missed set under the rep floor
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [
        _LoggedSet(reps=5, perceived_difficulty=8),
        _LoggedSet(reps=3, perceived_difficulty=9),
    ]

    # Act
    result = next_prescription(prescription, sets, ProgressionScheme.DOUBLE_PROGRESSION)

    # Assert — the cautious back-off is preserved under the named scheme
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "55 kg"


@pytest.mark.parametrize(
    "reps, load",
    [
        ("5", "60 kg"),              # absolute
        ("5", "bodyweight + 10 kg"),  # bodyweight + added
        ("8-12", "bodyweight"),      # pure bodyweight
        ("5", "70% 1RM"),            # percent-1RM
        ("5", "70-80 kg"),           # range
        ("5", "moderate"),           # qualitative
    ],
)
def test_static_holds_the_authored_values_for_every_load_kind(reps, load):
    # Arrange — a session strong enough to make Double Progression step every axis
    prescription = _Prescription(reps=reps, recommended_load=load)
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, ProgressionScheme.STATIC)

    # Assert — Static never moves: authored reps and load carried through as a HOLD
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == reps
    assert result.recommended_load == load


def test_static_never_offers_a_harder_variation_at_the_bodyweight_ceiling():
    # Arrange — a pure-bodyweight target already at its ceiling, hit easily: the exact
    # case where Double Progression raises the harder-Variation offer
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, ProgressionScheme.STATIC)

    # Assert — Static holds and stays silent; it never raises the offer
    assert result.kind is ProgressionKind.HOLD
    assert result.suggest_harder_variation is False


def test_static_ignores_a_missed_session_and_still_holds():
    # Arrange — a badly missed session that would back Double Progression off
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=1, perceived_difficulty=10)]

    # Act
    result = next_prescription(prescription, sets, ProgressionScheme.STATIC)

    # Assert — the record does not move a Static movement in either direction
    assert result.recommended_load == "60 kg"


@pytest.mark.parametrize(
    "scheme",
    [
        ProgressionScheme.DOUBLE_PROGRESSION,
        ProgressionScheme.STATIC,
        ProgressionScheme.SESSION_COUNT,
    ],
)
@pytest.mark.parametrize("load_kind", list(LoadKind))
def test_the_universal_schemes_apply_to_every_load_kind(scheme, load_kind):
    # Assert — the full-vocabulary schemes accept every Load kind: Double Progression
    # (the default) and Session-Count step the clean axes and hold the rest, and Static
    # holds any kind. Greyskull is bounded and is covered separately.
    assert scheme_applies_to(scheme, load_kind) is True


def test_compatibility_predicate_reads_the_registered_load_kinds(monkeypatch):
    # Arrange — a scheme restricted to absolute loads only (later schemes look like this).
    # monkeypatch.setitem restores the registry leak-safely, so the global is untouched
    # for other tests even if an assertion fails mid-way.
    from app.domain import progression as module

    restricted = module._SchemeEntry(
        module._REGISTRY[ProgressionScheme.STATIC].step, frozenset({LoadKind.ABSOLUTE})
    )
    monkeypatch.setitem(module._REGISTRY, ProgressionScheme.STATIC, restricted)

    # Act / Assert — the predicate answers from the entry's declared Load kinds
    assert scheme_applies_to(ProgressionScheme.STATIC, LoadKind.ABSOLUTE) is True
    assert scheme_applies_to(ProgressionScheme.STATIC, LoadKind.BODYWEIGHT) is False


def test_resolve_scheme_maps_a_null_selection_to_the_default():
    # Assert — an unset stored selection (every existing/generated Prescription) resolves
    # to Double Progression, so the read path behaves exactly as before ADR-0064.
    assert resolve_scheme(None) is DEFAULT_SCHEME
    assert resolve_scheme(None) is ProgressionScheme.DOUBLE_PROGRESSION


def test_resolve_scheme_maps_a_stored_value_back_to_its_member():
    # Assert — a stored selection is the closed enum's own string, so it round-trips
    assert resolve_scheme("static") is ProgressionScheme.STATIC
    assert resolve_scheme("double_progression") is ProgressionScheme.DOUBLE_PROGRESSION


def test_resolve_scheme_rejects_an_unrecognized_value():
    # Assert — an unknown selection fails fast rather than silently picking a scheme
    with pytest.raises(ValueError):
        resolve_scheme("nonsense")


def test_no_scheme_auto_swaps_at_the_pure_bodyweight_ceiling():
    # Arrange — the one place a rep-stepping scheme could "run out of room": a
    # pure-bodyweight target at its ceiling, hit easily
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert — for *every* registered scheme, the movement is never swapped: the
    # load is carried through unchanged (any pressure surfaces as an offer, not a swap)
    for scheme in ProgressionScheme:
        result = next_prescription(prescription, sets, scheme)
        assert result.recommended_load == "bodyweight"


# --- Greyskull-style Linear scheme (ADR-0064, #430) ---------------------------------
# A loaded-movement methodology bounded to absolute + bodyweight-added Loads. It steps
# the Load up by the standard increment *per session* on hitting the rep floor (no
# low-effort gate, AMRAP-aware final set), and — the trait that distinguishes it from
# Double Progression's cautious fixed back-off — deloads by RESET_FRACTION on a miss.

GREYSKULL = ProgressionScheme.GREYSKULL


def test_greyskull_is_in_the_closed_catalog():
    # Assert — the scheme is registered under its stored value
    assert GREYSKULL.value == "greyskull"


@pytest.mark.parametrize(
    "load_kind, expected",
    [
        (LoadKind.ABSOLUTE, True),
        (LoadKind.BODYWEIGHT, True),  # bodyweight-added is the refined case below
        (LoadKind.PERCENT_1RM, False),
        (LoadKind.QUALITATIVE, False),
        (LoadKind.RANGE, False),
    ],
)
def test_greyskull_registers_for_absolute_and_bodyweight_only(load_kind, expected):
    # Assert — the coarse LoadKind gate: compatible with absolute + bodyweight, and
    # rejects the non-clean loads (%-1RM, qualitative, range) outright
    assert scheme_applies_to(GREYSKULL, load_kind) is expected


@pytest.mark.parametrize(
    "load, expected",
    [
        ("60 kg", True),                 # absolute
        ("bodyweight + 10 kg", True),    # bodyweight + added
        ("bodyweight", False),           # pure bodyweight — no kg axis to step
        ("bw", False),                   # pure bodyweight, abbreviated
        ("70% 1RM", False),              # non-clean
        ("70-80 kg", False),             # non-clean (range)
        ("moderate", False),             # non-clean (qualitative)
    ],
)
def test_greyskull_compatibility_rejects_pure_bodyweight_and_non_clean_loads(
    load, expected
):
    # Assert — the full typed-Load predicate refines the LoadKind gate with the one
    # distinction LoadKind can't carry: pure bodyweight (no added kg) is rejected while
    # bodyweight-added is accepted
    assert scheme_applies_to_load(GREYSKULL, parse_load(load)) is expected


def test_greyskull_steps_the_absolute_load_up_per_session_on_a_hit():
    # Arrange — every set met the rep floor
    prescription = _Prescription(reps="5", recommended_load="100 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — one standard increment up, per session
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "102.5 kg"


def test_greyskull_steps_up_even_when_the_effort_was_high():
    # Arrange — the floor was met but every set felt maximal (no low-effort gate)
    prescription = _Prescription(reps="5", recommended_load="100 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=10) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — Greyskull steps every session a hit lands, unlike Double Progression's
    # low-effort gate which would hold here
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "102.5 kg"


def test_greyskull_steps_the_added_bodyweight_load_up_on_a_hit():
    # Arrange — a weighted bodyweight movement whose floor was met
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 20 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=8) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — the *added* kilograms step by the standard increment
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 22.5 kg"


def test_greyskull_reads_an_amrap_target_and_steps_up_when_the_floor_is_beaten():
    # Arrange — an AMRAP final-set target ("5+" = five-or-more); the set beat the floor
    prescription = _Prescription(reps="5+", recommended_load="100 kg")
    sets = [_LoggedSet(reps=9, perceived_difficulty=7) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — the AMRAP grammar is read (not held on as None); beating the floor is a hit
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "102.5 kg"


def test_greyskull_reads_an_amrap_target_on_an_added_bodyweight_load():
    # Arrange — AMRAP floor of 5, comfortably beaten, on a weighted bodyweight movement
    prescription = _Prescription(reps="5+", recommended_load="bodyweight + 20 kg")
    sets = [_LoggedSet(reps=8, perceived_difficulty=7) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — a beaten AMRAP floor steps the added load up
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 22.5 kg"


def test_greyskull_deloads_the_absolute_load_by_the_reset_fraction_on_a_miss():
    # Arrange — a set fell below the rep floor
    prescription = _Prescription(reps="5", recommended_load="100 kg")
    sets = [
        _LoggedSet(reps=5, perceived_difficulty=8),
        _LoggedSet(reps=3, perceived_difficulty=10),
    ]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — a fractional reset (−10%), not Double Progression's fixed −5 kg hold
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "90 kg"
    assert result.recommended_load == f"{int(100 * RESET_FRACTION)} kg"


def test_greyskull_deload_uses_the_fraction_not_the_fixed_decrease():
    # Arrange — the same miss under Double Progression backs off a fixed 5 kg
    prescription = _Prescription(reps="5", recommended_load="100 kg")
    sets = [_LoggedSet(reps=2, perceived_difficulty=10)]

    # Act
    greyskull = next_prescription(prescription, sets, GREYSKULL)
    double = next_prescription(
        prescription, sets, ProgressionScheme.DOUBLE_PROGRESSION
    )

    # Assert — the two schemes deload differently: fraction vs fixed decrease
    assert greyskull.recommended_load == "90 kg"
    assert double.recommended_load == "95 kg"


def test_greyskull_deloads_the_added_bodyweight_load_by_the_reset_fraction():
    # Arrange — a weighted bodyweight movement missed below the floor
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 20 kg")
    sets = [_LoggedSet(reps=2, perceived_difficulty=10)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — the *added* kilograms reset by the fraction (20 → 18)
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 18 kg"


def test_greyskull_holds_with_no_logged_sets():
    # Arrange — nothing performed yet, so there is no floor evidence to act on
    prescription = _Prescription(reps="5", recommended_load="100 kg")

    # Act
    result = next_prescription(prescription, [], GREYSKULL)

    # Assert — the recommendation is unchanged
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "100 kg"


def test_greyskull_holds_a_pure_bodyweight_movement_it_cannot_step():
    # Arrange — pure bodyweight is incompatible; defensively the step must not invent a
    # kilogram axis if ever dispatched here
    prescription = _Prescription(reps="5", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — held, no reps or load moved
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "bodyweight"
    assert result.reps == "5"


def test_greyskull_holds_a_floorless_amrap_target():
    # Arrange — a bare "AMRAP" carries no number to test a hit against
    prescription = _Prescription(reps="AMRAP", recommended_load="100 kg")
    sets = [_LoggedSet(reps=8, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_prescription(prescription, sets, GREYSKULL)

    # Assert — with no floor to read, the scheme holds rather than stepping blind
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "100 kg"


# --- Session-Count-Based scheme (ADR-0064, #431) ------------------------------------
# The calendar-free reinterpretation of "time-based": it steps unconditionally on every
# N-th *performed exposure* of the movement (default N via SESSION_COUNT_N), on the same
# axis Double Progression uses, with no rep/effort gate and no reset. The exposure count
# is passed in explicitly so the domain function stays pure; only the count advances it.

SESSION_COUNT = ProgressionScheme.SESSION_COUNT


def test_session_count_is_in_the_closed_catalog():
    # Assert — the scheme is registered under its stored value
    assert SESSION_COUNT.value == "session_count"


def test_session_count_default_cadence_is_three():
    # Assert — the single fixed v1 cadence is a named constant defaulting to 3
    assert SESSION_COUNT_N == 3


@pytest.mark.parametrize("load_kind", list(LoadKind))
def test_session_count_applies_to_the_same_load_kinds_as_double_progression(load_kind):
    # Assert — Session-Count is registered against the full Load vocabulary, exactly as
    # Double Progression is (it steps the clean axes and holds the rest)
    assert scheme_applies_to(SESSION_COUNT, load_kind) is scheme_applies_to(
        ProgressionScheme.DOUBLE_PROGRESSION, load_kind
    )


# The step is driven by the exposure count alone (a cumulative ramp of one increment per
# elapsed cadence), so a session strong enough for Double Progression to step is used
# throughout to prove the *count* — not the reps/effort — is what drives Session-Count.
def _neutral_sets() -> list[_LoggedSet]:
    """Three sets that neither hit a ceiling nor miss a floor for a "5" target — so any
    step Session-Count makes is driven purely by the exposure count, not the record."""

    return [_LoggedSet(reps=5, perceived_difficulty=8) for _ in range(3)]


@pytest.mark.parametrize("exposure_count", [1, 2])
def test_session_count_holds_before_the_first_cadence(exposure_count):
    # Arrange — an absolute load before the first N exposures have elapsed
    prescription = _Prescription(reps="5", recommended_load="100 kg")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, exposure_count
    )

    # Assert — no cadence elapsed yet, so it holds the authored load
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "100 kg"


@pytest.mark.parametrize("exposure_count", [3, 4, 5])
def test_session_count_steps_once_at_the_first_cadence_and_holds_between(exposure_count):
    # Arrange — the first cadence (exposure 3) and the intervening exposures 4, 5
    prescription = _Prescription(reps="5", recommended_load="100 kg")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, exposure_count
    )

    # Assert — one increment lands at the cadence and *holds* through the intervening
    # exposures (the value does not drift back down between cadences)
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "102.5 kg"


@pytest.mark.parametrize(
    "exposure_count, expected",
    [(6, "105 kg"), (9, "107.5 kg"), (12, "110 kg")],
)
def test_session_count_accumulates_one_increment_per_cadence_and_never_resets(
    exposure_count, expected
):
    # Arrange — later cadences: the ramp compounds and only ever grows (ADR-0064: no reset)
    prescription = _Prescription(reps="5", recommended_load="100 kg")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, exposure_count
    )

    # Assert — one increment per elapsed cadence, monotonically up
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == expected


def test_session_count_steps_up_regardless_of_high_effort_or_missed_reps():
    # Arrange — a badly missed, maximal-effort session that Double Progression would step
    # *down*, but the cadence has elapsed
    prescription = _Prescription(reps="5", recommended_load="100 kg")
    missed = [_LoggedSet(reps=1, perceived_difficulty=10) for _ in range(3)]

    # Act
    result = next_prescription(prescription, missed, SESSION_COUNT, SESSION_COUNT_N)

    # Assert — no rep/effort gate and no reset: the elapsed cadence still steps up
    assert result.kind is ProgressionKind.LOAD_STEP
    assert result.recommended_load == "102.5 kg"


def test_session_count_steps_the_added_bodyweight_load_at_the_cadence():
    # Arrange — a weighted bodyweight movement two cadences in
    prescription = _Prescription(reps="5", recommended_load="bodyweight + 10 kg")

    # Act — six exposures = two elapsed cadences
    result = next_prescription(prescription, _neutral_sets(), SESSION_COUNT, 6)

    # Assert — the *added* kilograms accumulate two increments (10 → 15)
    assert result.kind is ProgressionKind.ADDED_LOAD_STEP
    assert result.recommended_load == "bodyweight + 15 kg"


def test_session_count_steps_the_pure_bodyweight_reps_toward_the_ceiling():
    # Arrange — a pure-bodyweight movement with rep headroom, one cadence in
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, SESSION_COUNT_N
    )

    # Assert — with no weight to add, the rep target's floor steps one rep toward the
    # ceiling; the movement stays bodyweight
    assert result.kind is ProgressionKind.REPS_STEP
    assert result.reps == "9-12"
    assert result.recommended_load == "bodyweight"


def test_session_count_raises_the_reps_by_the_elapsed_cadences():
    # Arrange — three cadences elapsed (nine exposures) on an 8–12 target
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")

    # Act
    result = next_prescription(prescription, _neutral_sets(), SESSION_COUNT, 9)

    # Assert — the floor rises by three toward the ceiling (8 → 11), clamped by the ceiling
    assert result.kind is ProgressionKind.REPS_STEP
    assert result.reps == "11-12"


def test_session_count_offers_a_harder_variation_at_the_bodyweight_ceiling():
    # Arrange — a pure-bodyweight target already at its ceiling, one cadence in: reps can
    # grow no further
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, SESSION_COUNT_N
    )

    # Assert — never-auto-swap: it holds and raises the harder-Variation offer instead of
    # growing reps unbounded (the movement is never swapped, ADR-0026)
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "12-12"
    assert result.recommended_load == "bodyweight"
    assert result.suggest_harder_variation is True


def test_session_count_offers_a_harder_variation_once_the_reps_ramp_past_the_ceiling():
    # Arrange — an 8–12 target with enough cadences elapsed to push the floor past the
    # ceiling (five cadences would put the floor at 13 > 12)
    prescription = _Prescription(reps="8-12", recommended_load="bodyweight")

    # Act — fifteen exposures = five elapsed cadences
    result = next_prescription(prescription, _neutral_sets(), SESSION_COUNT, 15)

    # Assert — reps never grow unbounded: at the ceiling the harder-Variation offer is
    # raised instead, and the movement holds (never auto-swaps)
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "bodyweight"
    assert result.suggest_harder_variation is True


def test_session_count_does_not_offer_at_the_ceiling_before_the_first_cadence():
    # Arrange — the same at-ceiling movement, but before the first cadence has elapsed
    prescription = _Prescription(reps="12-12", recommended_load="bodyweight")

    # Act
    result = next_prescription(prescription, _neutral_sets(), SESSION_COUNT, 2)

    # Assert — no step is due, so it plainly holds with no offer raised
    assert result.kind is ProgressionKind.HOLD
    assert result.suggest_harder_variation is False


@pytest.mark.parametrize("load", ["70% 1RM", "70-80 kg", "moderate"])
def test_session_count_holds_a_load_with_no_clean_value_even_at_the_cadence(load):
    # Arrange — a %-1RM, range, or qualitative Load has no single value to move, at a
    # cadence
    prescription = _Prescription(reps="5", recommended_load=load)

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, SESSION_COUNT_N
    )

    # Assert — nothing clean to step, so it holds exactly as every other scheme leaves it
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == load


def test_session_count_never_advances_on_a_layoff_with_zero_exposures():
    # Arrange — a movement never performed (a layoff before its first exposure)
    prescription = _Prescription(reps="5", recommended_load="100 kg")

    # Act
    result = next_prescription(prescription, _neutral_sets(), SESSION_COUNT, 0)

    # Assert — only *performed* exposures advance it, so a zero count can never step
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load == "100 kg"


def test_session_count_holds_a_null_load():
    # Arrange — no recommendation to move, even at a cadence
    prescription = _Prescription(reps="5", recommended_load=None)

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, SESSION_COUNT_N
    )

    # Assert
    assert result.kind is ProgressionKind.HOLD
    assert result.recommended_load is None


def test_session_count_holds_a_pure_bodyweight_with_an_unreadable_rep_target():
    # Arrange — a pure-bodyweight movement whose rep target can't be read ("AMRAP"), at a
    # cadence: there is no floor/ceiling to step
    prescription = _Prescription(reps="AMRAP", recommended_load="bodyweight")

    # Act
    result = next_prescription(
        prescription, _neutral_sets(), SESSION_COUNT, SESSION_COUNT_N
    )

    # Assert — nothing to move, so it holds
    assert result.kind is ProgressionKind.HOLD
    assert result.reps == "AMRAP"
    assert result.recommended_load == "bodyweight"
