"""The request bodies of the Warm-up Suggestion routes (ADR-0143).

- ``WarmUpSuggestionBody`` — the optional preview request: ``regenerate`` skips the cache read.
- ``ApplyWarmUpBody`` — the drills to add, each in the shape the preview returned it. A drill
  is closed at this boundary exactly as the generator's output is: a whole number of reps or
  seconds (at least 1, never truncated), a bodyweight or named qualitative Load (never kg),
  and brisk rest. ``ApplyDrillBody.to_drill`` hands back the domain ``WarmUpDrill``.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from app.domain.quantity import QuantityKind
from app.domain.warm_up import (
    MAX_DRILL_AMOUNT,
    MAX_DRILL_REST_SECONDS,
    MAX_DRILLS,
    DrillLoadKind,
    DrillQuantityKind,
    WarmUpDrill,
    drill_load_names_itself,
)


class WarmUpSuggestionBody(BaseModel):
    """``regenerate`` asks for a fresh suggestion: it skips the cache read (ADR-0003)."""

    regenerate: bool = False


class DrillQuantityBody(BaseModel):
    """A drill's Prescribed Quantity as the preview returned it: reps or whole seconds.

    Both amounts are whole numbers of at least 1: a fractional value (``0.5`` s) is refused,
    never truncated, so a drill can never be stored with a zero amount. A whole value sent
    as a float (``30.0``) is accepted as that integer."""

    kind: DrillQuantityKind
    count: int | None = Field(default=None, ge=1, le=MAX_DRILL_AMOUNT)
    seconds: int | None = Field(default=None, ge=1, le=MAX_DRILL_AMOUNT)

    @model_validator(mode="after")
    def _carries_its_amount(self) -> "DrillQuantityBody":
        if self._given_amount() is None:
            raise ValueError(f"a {self.kind.value} quantity needs its amount")
        return self

    def _given_amount(self) -> int | None:
        return self.count if self.kind is QuantityKind.REPETITIONS else self.seconds

    @property
    def amount(self) -> int:
        amount = self._given_amount()
        if amount is None:  # unreachable once validated; never coerce a missing amount to 0
            raise ValueError(f"a {self.kind.value} quantity needs its amount")
        return amount


class DrillLoadBody(BaseModel):
    """A drill's Load: bodyweight or a named qualitative Load — never kg."""

    kind: DrillLoadKind
    text: str | None = None

    @model_validator(mode="after")
    def _qualitative_load_names_itself(self) -> "DrillLoadBody":
        if not drill_load_names_itself(self.kind, self.text):
            raise ValueError("a qualitative load needs its text")
        return self


class ApplyDrillBody(BaseModel):
    """One drill to add, in the shape the suggestion preview returns it. Its name, sets,
    reps line and Set Type are not read: every drill becomes one ``warm_up`` set whose reps
    line is derived from its Quantity."""

    exercise_id: int
    prescribed_quantity: DrillQuantityBody
    recommended_load: DrillLoadBody
    rest_seconds: int = Field(ge=0, le=MAX_DRILL_REST_SECONDS)

    def to_drill(self) -> WarmUpDrill:
        return WarmUpDrill(
            exercise_id=self.exercise_id,
            quantity_kind=self.prescribed_quantity.kind,
            amount=self.prescribed_quantity.amount,
            load_kind=self.recommended_load.kind,
            load_text=self.recommended_load.text,
            rest_seconds=self.rest_seconds,
        )


class ApplyWarmUpBody(BaseModel):
    drills: list[ApplyDrillBody] = Field(min_length=1, max_length=MAX_DRILLS)


__all__ = [
    "ApplyDrillBody",
    "ApplyWarmUpBody",
    "DrillLoadBody",
    "DrillQuantityBody",
    "WarmUpSuggestionBody",
]
