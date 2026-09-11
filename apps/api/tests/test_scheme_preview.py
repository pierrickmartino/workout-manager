"""Behavior of the Scheme Preview projection (ADR-0064/0065, #452).

``scheme_preview`` is a pure read-time projection from ``(scheme, reps, Load)`` to one
plain-language sentence — the same species as Tempo's phase expansion. These tests pin one
sentence per scheme and, above all, the **Load-kind honesty** rule: a weight axis speaks of
kilograms, a pure-bodyweight movement of reps (never "add kg"), and a Load with no clean
value to step says so. No mocks; the Load is built through the real ``parse_load`` seam.
"""

from __future__ import annotations

from app.domain.load import parse_load
from app.domain.progression import ProgressionScheme
from app.domain.scheme_preview import scheme_preview

ABSOLUTE = parse_load("60 kg")
WEIGHTED_BODYWEIGHT = parse_load("bodyweight + 10 kg")
PURE_BODYWEIGHT = parse_load("bodyweight")
PERCENT = parse_load("70% 1RM")
RANGE = parse_load("70-80 kg")
QUALITATIVE = parse_load("moderate")


# --- Double Progression -----------------------------------------------------------------


def test_double_progression_absolute_load_speaks_of_kilograms():
    sentence = scheme_preview(ProgressionScheme.DOUBLE_PROGRESSION, "8-12", ABSOLUTE)

    assert sentence == (
        "Aim for 8–12 reps; when every set reaches 12 at RPE 7 or lower, add 2.5 kg next "
        "time — miss the 8-rep floor and it backs off 5 kg."
    )


def test_double_progression_weighted_bodyweight_also_steps_kilograms():
    sentence = scheme_preview(
        ProgressionScheme.DOUBLE_PROGRESSION, "6-10", WEIGHTED_BODYWEIGHT
    )

    assert "add 2.5 kg next time" in sentence
    assert "Aim for 6–10 reps" in sentence


def test_double_progression_pure_bodyweight_speaks_of_reps_not_kilograms():
    sentence = scheme_preview(
        ProgressionScheme.DOUBLE_PROGRESSION, "8-12", PURE_BODYWEIGHT
    )

    assert "add a rep to the target next time" in sentence
    assert "kg" not in sentence


def test_double_progression_pure_bodyweight_at_ceiling_offers_a_harder_variation():
    # A single rep target (floor == ceiling) has no room to grow, so strong work offers a
    # harder Variation rather than more reps — the never-auto-swap rule read aloud.
    sentence = scheme_preview(ProgressionScheme.DOUBLE_PROGRESSION, "20", PURE_BODYWEIGHT)

    assert "harder variation" in sentence
    assert "kg" not in sentence


def test_double_progression_non_clean_load_holds_honestly():
    for load in (PERCENT, RANGE, QUALITATIVE):
        sentence = scheme_preview(ProgressionScheme.DOUBLE_PROGRESSION, "8-12", load)
        assert "needs a single load value to step" in sentence
        assert "add" not in sentence


def test_double_progression_unparseable_reps_holds_on_the_rep_target():
    sentence = scheme_preview(ProgressionScheme.DOUBLE_PROGRESSION, "AMRAP", ABSOLUTE)

    assert "needs a set rep target to step" in sentence


# --- Greyskull-style Linear -------------------------------------------------------------


def test_greyskull_absolute_load_steps_and_resets():
    sentence = scheme_preview(ProgressionScheme.GREYSKULL, "5+", ABSOLUTE)

    assert sentence == (
        "Do 5+ reps with an all-out final set; clear the 5-rep floor and add 2.5 kg next "
        "session — miss it and the load resets down 10%."
    )


def test_greyskull_reads_a_range_floor():
    sentence = scheme_preview(ProgressionScheme.GREYSKULL, "5-8", WEIGHTED_BODYWEIGHT)

    assert "clear the 5-rep floor" in sentence
    assert "resets down 10%" in sentence


def test_greyskull_on_pure_bodyweight_reads_as_inapplicable():
    # The selector never offers Greyskull to a pure-bodyweight movement; the preview is
    # honest rather than fabricating a kilogram step it could never take.
    sentence = scheme_preview(ProgressionScheme.GREYSKULL, "8-12", PURE_BODYWEIGHT)

    assert "only steps a weighted movement" in sentence
    assert "kg" not in sentence


# --- Session-Count-Based ----------------------------------------------------------------


def test_session_count_absolute_steps_every_third_exposure_with_no_gate():
    sentence = scheme_preview(ProgressionScheme.SESSION_COUNT, "5", ABSOLUTE)

    assert sentence == (
        "Keep 5 reps; every 3rd time you train this movement it adds 2.5 kg automatically "
        "— no rep or effort target gates it, and it never steps down."
    )


def test_session_count_pure_bodyweight_adds_a_rep_not_kilograms():
    sentence = scheme_preview(ProgressionScheme.SESSION_COUNT, "8-12", PURE_BODYWEIGHT)

    assert "adds a rep to the 8–12 reps target" in sentence
    assert "kg" not in sentence


def test_session_count_non_clean_load_holds_honestly():
    sentence = scheme_preview(ProgressionScheme.SESSION_COUNT, "8-12", PERCENT)

    assert "has no single value to step" in sentence
    assert "never steps down" not in sentence


# --- Static -----------------------------------------------------------------------------


def test_static_holds_every_load_kind_by_hand():
    for load in (ABSOLUTE, PURE_BODYWEIGHT, PERCENT, RANGE):
        sentence = scheme_preview(ProgressionScheme.STATIC, "8-12", load)
        assert sentence.startswith("Static holds 8–12 reps")
        assert "nothing auto-adjusts; you set the numbers by hand." in sentence


def test_static_without_a_load_omits_the_load_clause():
    sentence = scheme_preview(ProgressionScheme.STATIC, "8-12", None)

    assert sentence == (
        "Static holds 8–12 reps exactly as written — nothing auto-adjusts; you set the "
        "numbers by hand."
    )


def test_every_scheme_yields_a_nonempty_sentence_for_a_missing_load():
    # No Load at all resolves to the "no clean value" axis for the stepping schemes and is
    # still a true sentence for each — the projection never crashes on an absent Load.
    for scheme in ProgressionScheme:
        sentence = scheme_preview(scheme, "8-12", None)
        assert isinstance(sentence, str) and sentence.strip()
