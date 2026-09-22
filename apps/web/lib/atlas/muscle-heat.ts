// The heat ramp for the anatomical Muscle Atlas body map (issue #543, honouring ADR-0025).
//
// A trained muscle fills with its group hue at an opacity that grows with the view-model's
// emphasis-weighted `intensity` (0–1, relative to the busiest muscle), so the body reads as a
// gradient of what the user actually did — descriptive, never a quota fill or a rank. This is the
// one piece of genuine computation behind the figure, so it lives here (pure, server-free, and
// unit-tested) rather than as loose arithmetic in the component, and its tuning lives in named
// constants rather than magic numbers.

// A just-trained muscle still reads as clearly filled (never a hairline), and full
// busiest-muscle intensity adds up to the ceiling below — so the ramp runs [MIN, MIN + RANGE].
export const HEAT_MIN_OPACITY = 0.22;
export const HEAT_RANGE = 0.6;
// The extra fill a muscle takes when it is under a fine pointer or holds keyboard focus, so the
// muscle being pointed at reads as live without implying it is selected.
export const HEAT_ACTIVE_BOOST = 0.18;
// A selected (drawer-open) muscle is near-solid so it stands out from the rest of the body.
export const HEAT_SELECTED_OPACITY = 0.95;
// A selected but *untrained* muscle gets a faint wash so the selection is visible without
// fabricating heat where there was no training.
export const HEAT_UNTRAINED_SELECTED_OPACITY = 0.18;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export interface HeatState {
  selected: boolean;
  active: boolean;
}

// The fill opacity for a *trained* muscle path at a given intensity and interaction state.
// Selection wins over the active (hover/focus) boost; the boost is clamped so it never exceeds a
// solid fill.
export function heatFillOpacity(intensity: number, { selected, active }: HeatState): number {
  if (selected) return HEAT_SELECTED_OPACITY;
  const base = HEAT_MIN_OPACITY + HEAT_RANGE * clamp01(intensity);
  return active ? Math.min(1, base + HEAT_ACTIVE_BOOST) : base;
}
