/**
 * The pain scale — one definition for labels, formatting, colour and the
 * daily average. Every screen, the report, the notifications and the
 * VoiceOver strings read from here, so the scale can never drift between
 * two places.
 *
 * SCALE VERSION 3 (2026-08-20)
 *   v1 stored pain as an integer 0–10 with an eleven-word label list; v2
 *   made the words monotonic; v3 replaces the eleven words with five
 *   consistent categories — No pain / Mild / Moderate / Severe / Most
 *   intense — used identically everywhere the scale appears.
 *
 *   The numbers are the stored truth and the words are presentation, so
 *   NO stored value changes between versions. `normalizePain` coerces
 *   anything arriving from an old backup or a corrupted row into the
 *   domain, and `SCALE_VERSION` is written into backups so a future
 *   reader can tell which label set the numbers were captured under.
 */
import { DEFAULT_PAIN_THEME, PAIN_THEMES, PainTheme, PainThemeId } from './theme';

export const SCALE_VERSION = 3;
export const PAIN_MIN = 0;
export const PAIN_MAX = 10;

/** The five categories, keyed by score:
 *  0 = No pain · 1–3 = Mild · 4–6 = Moderate · 7–9 = Severe · 10 = Most
 *  intense. One vocabulary for the slider, home, calendar, day detail and
 *  the report. */
export function painLabel(v: number): string {
  const i = Math.max(PAIN_MIN, Math.min(PAIN_MAX, Math.round(v)));
  if (i === 0) return 'No pain';
  if (i <= 3) return 'Mild';
  if (i <= 6) return 'Moderate';
  if (i <= 9) return 'Severe';
  return 'Most intense';
}

/**
 * One score inside each band, low to high — the handle anything that
 * groups days by band should reach for.
 *
 * It lives here, beside painLabel, so a grouping is never a second list
 * of band names kept in step by hand. Callers ask painLabel(at) for the
 * word; a test holds these five to covering every score 0–10, so adding
 * a sixth band to the scale breaks a build rather than quietly dropping
 * a band's days off whatever chart was counting them.
 */
export const BAND_AT = [0, 2, 5, 8, 10];

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

/** "5" for whole numbers, "4.5" when a decimal carries information */
export function formatScore(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "5/10" — the numeric representation that must always accompany colour */
export function formatOutOf(v: number): string {
  return formatScore(v) + '/' + PAIN_MAX;
}

/** "4.5 · Moderate" — the home hero and day-detail summary line */
export function formatScoreAndLabel(v: number): string {
  return formatScore(v) + ' · ' + painLabel(v);
}

/* ── colour ──────────────────────────────────────────────────
   One brightness ramp of the brand hue, interpolated smoothly between the
   anchors in theme.ts — a decimal average gets its own colour rather than
   snapping to a step, so transitions between values never band. */

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mixHexColor(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const at = (n: number, s: number) => (n >> s) & 255;
  return '#' + [16, 8, 0]
    .map((s) => mixChannel(at(na, s), at(nb, s), t))
    .map((v) => ('0' + v.toString(16)).slice(-2))
    .join('').toUpperCase();
}

/* ── the active theme ────────────────────────────────────────
   The hue is a preference; the scale is not. Switching themes swaps the
   anchor colours and nothing else — every label, number and rule above
   stays identical, so a violet 7 and a blue 7 are the same fact. */

let active: PainTheme = PAIN_THEMES.find((t) => t.id === DEFAULT_PAIN_THEME)!;

/** set the active pain palette; an unknown id is ignored, never a crash */
export function setPainTheme(id: unknown): void {
  const t = PAIN_THEMES.find((x) => x.id === id);
  if (t) active = t;
}

export function getPainTheme(): PainThemeId {
  return active.id;
}

/** the active theme's saturated accent — today's ring, tinted highlights */
export function themeBrand(): string {
  return active.brand;
}

/** the ramp colour for any score 0–10, decimals included */
export function painColor(v: number, theme?: PainThemeId): string {
  const anchors = theme
    ? (PAIN_THEMES.find((t) => t.id === theme) || active).anchors
    : active.anchors;
  const x = Math.max(PAIN_MIN, Math.min(PAIN_MAX, v));
  for (let i = 1; i < anchors.length; i++) {
    const [v0, c0] = anchors[i - 1];
    const [v1, c1] = anchors[i];
    if (x <= v1) return mixHexColor(c0, c1, (x - v0) / (v1 - v0));
  }
  return anchors[anchors.length - 1][1];
}

/** the eleven whole-step colours of the ACTIVE theme — for animated
 *  interpolation that needs a fixed stop list (the check-in shape) */
export function painRamp(): string[] {
  return Array.from({ length: PAIN_MAX + 1 }, (_, i) => painColor(i));
}

/** relative luminance of a hex colour, 0–1 (WCAG formula) */
export function luminanceOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Ink that stays legible on a given background, chosen by real luminance.
 *  The crossover is 0.179 — the point where black and white give equal
 *  WCAG contrast — so whichever ink is chosen always reaches at least
 *  4.5:1 on ANY background, in any theme. */
export function inkForBg(hex: string): string {
  return luminanceOf(hex) > 0.179 ? '#000000' : '#FFFFFF';
}

/** the legible foreground for a pain colour — light on the dark low end,
 *  dark on the luminous high end */
export function inkOn(v: number): string {
  return inkForBg(painColor(v));
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
