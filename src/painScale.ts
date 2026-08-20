/**
 * The pain scale — one definition for labels, formatting, colour and the
 * daily average. Every screen, the report, the notifications and the
 * VoiceOver strings read from here, so the scale can never drift between
 * two places.
 *
 * SCALE VERSION 2 (2026-08-20)
 *   v1 stored pain as an integer 0–10 and labelled it with an eleven-word
 *   list that repeated itself (two "Mild", two "Strong"). v2 keeps the
 *   identical numeric domain — 0–10 integers, 0 = no pain — and only
 *   replaces the words with a monotonic, non-repeating set.
 *
 *   Because the numbers are the stored truth and the words are presentation,
 *   NO stored value changes between v1 and v2. `normalizePain` exists so
 *   anything arriving from an old backup or a corrupted row is coerced into
 *   the domain, and `SCALE_VERSION` is written into backups so a future
 *   reader can tell which words a record was captured under.
 */
import { theme } from './theme';

export const SCALE_VERSION = 2;
export const PAIN_MIN = 0;
export const PAIN_MAX = 10;

/** index = the stored integer. Monotonic, no repeats, 0 is genuinely none. */
export const PAIN_LABELS = [
  'No pain',
  'Very mild',
  'Mild',
  'Noticeable',
  'Uncomfortable',
  'Moderate',
  'Strong',
  'Severe',
  'Very severe',
  'Extreme',
  'Most intense imaginable',
] as const;

/** the ends of the slider, which stay short */
export const PAIN_END_LOW = 'No pain';
export const PAIN_END_HIGH = 'Most intense';

/** ability at the named activity — a separate scale, never mixed with pain */
export const ABILITY_MIN = 0;
export const ABILITY_MAX = 10;
export const ABILITY_END_LOW = 'Not able at all';
export const ABILITY_END_HIGH = 'Fully able';

/** clamp anything to the stored domain: integer 0–10, or null if unusable */
export function normalizePain(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return Math.max(PAIN_MIN, Math.min(PAIN_MAX, Math.round(v)));
}

/** the word for a score. Averages round to the nearest whole word. */
export function painLabel(v: number): string {
  const i = Math.max(PAIN_MIN, Math.min(PAIN_MAX, Math.round(v)));
  return PAIN_LABELS[i];
}

/** "5" for whole numbers, "4.5" when a decimal carries information */
export function formatScore(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "5 / 10" — the numeric representation that must always accompany colour */
export function formatOutOf(v: number): string {
  return formatScore(v) + ' / ' + PAIN_MAX;
}

/** "4.5 · Moderate" — the home hero and day-detail summary line */
export function formatScoreAndLabel(v: number): string {
  return formatScore(v) + ' · ' + painLabel(v);
}

/** the ramp colour for a score, rounded to a whole step */
export function painColor(v: number): string {
  const i = Math.max(PAIN_MIN, Math.min(PAIN_MAX, Math.round(v)));
  return theme.ramp[i];
}

/** dark ink is legible up to inkAbove; lighter scores take black text */
export function inkOn(v: number): string {
  return Math.round(v) <= theme.inkAbove ? '#000000' : '#FFFFFF';
}

/** "2 check-ins" / "1 check-in" / "No check-ins yet today" */
export function formatCheckins(n: number, today = false): string {
  if (n === 0) return today ? 'No check-ins yet today' : 'No check-ins';
  return n + (n === 1 ? ' check-in' : ' check-ins');
}

/** a VoiceOver sentence for a score, spoken as words plus the number */
export function speakScore(v: number): string {
  return formatScore(v) + ' out of ' + PAIN_MAX + ', ' + painLabel(v);
}
