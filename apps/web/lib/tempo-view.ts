// Shared tempo view helpers. This module has NO server-only imports, so it is
// safe to import from both Server and Client Components.

// The coarse, curated three-state tempo signal (CONTEXT: Tempo) — a signal, not a
// score, derived deterministically from the parsed phases.
export type TempoLabel = "Explosive" | "Controlled" | "Slow";

// The rendered form of an Exercise Prescription's stored free-form tempo string.
export type TempoView =
  | { kind: "none" }
  | { kind: "raw"; raw: string }
  | {
      kind: "parsed";
      label: TempoLabel;
      expansion: string;
      raw: string;
      ariaLabel: string;
    };

// Turn a stored tempo string into its display model. An empty value renders no row
// at all; a non-empty value that is not 3- or 4-token notation is shown verbatim
// rather than given a fabricated interpretation (CONTEXT: Tempo).
export function toTempoView(tempo: string | null | undefined): TempoView {
  const raw = (tempo ?? "").trim();
  if (raw.length === 0) return { kind: "none" };
  const tokens = tokenize(raw);
  if (tokens === null) return { kind: "raw", raw };
  const label = classify(tokens);
  return {
    kind: "parsed",
    label,
    expansion: expand(tokens),
    raw,
    ariaLabel: `${label} tempo, ${expandSpoken(tokens)}`,
  };
}

// A deliberately slow eccentric (≥ this many seconds) reads as Slow.
const SLOW_ECCENTRIC_SECONDS = 4;
// Accumulated pause time (≥ this many seconds) also reads as Slow.
const SLOW_TOTAL_PAUSE_SECONDS = 2;

// Map the parsed phases onto the three-state signal.
function classify(tokens: string[]): TempoLabel {
  // Explosive wins first: an as-fast-as-possible concentric is the dominant intent.
  if (isExplosiveMovement(tokens[2])) return "Explosive";
  const eccentric = seconds(tokens[0]);
  // Pause slots are the bottom pause and, on a 4-token code, the top pause.
  const totalPause = seconds(tokens[1]) + seconds(tokens[3]);
  if (
    eccentric >= SLOW_ECCENTRIC_SECONDS ||
    totalPause >= SLOW_TOTAL_PAUSE_SECONDS
  ) {
    return "Slow";
  }
  return "Controlled";
}

// Whether a token is a valid tempo phase: a run of digits, or an explosive marker.
function isPhaseToken(token: string): boolean {
  return /^\d+$/.test(token) || token === "X" || token === "x";
}

// Whether a movement phase (eccentric/concentric) is explosive: an `X`/`x` marker
// or a bare `0` both mean as-fast-as-possible.
function isExplosiveMovement(token: string): boolean {
  return token === "X" || token === "x" || token === "0";
}

// A phase token as a count of seconds. An explosive marker (`X`/`x`) and a bare `0`
// both count as zero seconds of deliberate time under tension.
function seconds(token: string): number {
  if (token === undefined) return 0;
  const parsed = Number.parseInt(token, 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

// Split a tempo string into its phase tokens: eccentric / pause / concentric and,
// for 4-token notation, a trailing pause. A bare string is one digit per phase; a
// separated string splits on `-`, `/`, or whitespace. Returns null when the string
// is not recognizable 3- or 4-token notation.
function tokenize(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // A separated string (`3-1-1`, `10 0 2 0`) splits on its separators, allowing
  // multi-digit phases; a bare string (`3110`) is one character per phase.
  const hasSeparator = /[-/\s]/.test(trimmed);
  const tokens = hasSeparator
    ? trimmed.split(/[-/\s]+/).filter((t) => t.length > 0)
    : trimmed.split("");
  if (tokens.length !== 3 && tokens.length !== 4) return null;
  // Every phase must be a seconds count or an explosive marker; anything else
  // (free text, stray letters) is not tempo notation.
  return tokens.every(isPhaseToken) ? tokens : null;
}

// The visible expansion ("3s lower · 1s pause · 1s lift"): compact seconds, "·"-joined.
function expand(tokens: string[]): string {
  return renderPhases(tokens, (token) => `${token}s`, " · ");
}

// The screen-reader expansion ("3 seconds lower, 1 second pause, 1 second lift"):
// full pluralised words, comma-joined so it reads naturally aloud.
function expandSpoken(tokens: string[]): string {
  return renderPhases(tokens, spokenSeconds, ", ");
}

// How a seconds count is worded — the only axis on which the visible and spoken
// expansions differ, alongside the separator.
type SecondsWording = (token: string) => string;

// Walk the phases eccentric-first — lower / pause / lift / (top pause) — wording each
// with `fmt` and joining with `separator`. Explosive movement phases read as
// "explosive lower/lift"; a zero-length pause is dropped rather than voiced as "0s".
function renderPhases(
  tokens: string[],
  fmt: SecondsWording,
  separator: string,
): string {
  const [eccentric, pauseBottom, concentric, pauseTop] = tokens;
  const pieces = [
    movementPhrase(eccentric, "lower", fmt),
    pausePhrase(pauseBottom, fmt),
    movementPhrase(concentric, "lift", fmt),
    pausePhrase(pauseTop, fmt),
  ];
  return pieces.filter((piece) => piece !== null).join(separator);
}

function movementPhrase(
  token: string,
  verb: "lower" | "lift",
  fmt: SecondsWording,
): string {
  return isExplosiveMovement(token) ? `explosive ${verb}` : `${fmt(token)} ${verb}`;
}

function pausePhrase(
  token: string | undefined,
  fmt: SecondsWording,
): string | null {
  return token === undefined || seconds(token) === 0 ? null : `${fmt(token)} pause`;
}

// A seconds count spoken with correct pluralisation ("1 second", "3 seconds").
function spokenSeconds(token: string): string {
  const n = seconds(token);
  return `${n} ${n === 1 ? "second" : "seconds"}`;
}
