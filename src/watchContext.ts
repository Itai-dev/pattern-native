/**
 * What the watch is given — the pure half, same split as widget.ts.
 *
 * The watch cannot read painScale: it is a separate binary in Swift.
 * The first watch build answered that by staying white — a number and
 * no colour — because a second copy of the ramp in Swift would drift
 * the first time a theme was touched. This is the other answer, the
 * one the widget already uses: THE PHONE COMPUTES, THE WATCH RECEIVES.
 * Eleven fills, eleven inks and eleven words, from the same painColor,
 * inkOn and painLabel every screen reads, pushed across WCSession's
 * application context whenever the theme is picked and whenever the app
 * comes forward. One definition of the scale, still — and a theme change
 * on the phone reaches the wrist without a native build.
 *
 * WHAT DOES NOT TRAVEL: nothing about the record. This is the scale's
 * presentation, which is the same for every user; no entry, no average,
 * no day. The watch remains an input device that knows what colour a 6
 * wears, not what the user's 6s have been.
 *
 * Application context is the right channel and not user-info: it is
 * "latest state", not a queue — the system keeps only the newest, holds
 * it until the watch is reachable, and persists it on the watch across
 * launches. A palette pushed while the watch was in a drawer arrives
 * when it comes out, and one pushed twice arrives once.
 */
import { PainThemeId } from './theme';
import {
  PAIN_MAX, PAIN_MIN, getPainTheme, inkForBg, painLabel, painRamp,
} from './painScale';

/** bumped only if the watch has to parse this differently; the watch
 *  ignores a version it does not know rather than guessing at fields */
export const WATCH_CONTEXT_VERSION = 1;

export interface WatchContext {
  v: number;
  theme: PainThemeId;
  /** index = the whole score, 0–10 */
  ramp: string[];
  ink: string[];
  words: string[];
}

export function watchContext(): WatchContext {
  const ramp = painRamp();
  const scores = Array.from({ length: PAIN_MAX - PAIN_MIN + 1 }, (_, i) => PAIN_MIN + i);
  return {
    v: WATCH_CONTEXT_VERSION,
    theme: getPainTheme(),
    ramp,
    ink: ramp.map(inkForBg),
    words: scores.map(painLabel),
  };
}
