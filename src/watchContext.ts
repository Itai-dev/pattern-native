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
 * WHAT TRAVELS ABOUT THE RECORD, since 16 Sep 2026: the last seven days
 * as FILLS — the colour each day's average wears on the calendar, or an
 * empty string for a day with nothing recorded — and their weekday
 * letters. The founder's call, and the same line the widget drew: the
 * shape of the week, in colours only. No number, no average as a
 * figure, no count of days logged, nothing that rates today. The watch
 * still holds no record; it draws seven strings it was handed and keeps
 * nothing else. An older watch build ignores the extra keys, because it
 * reads only the ones it knows.
 *
 * Application context is the right channel and not user-info: it is
 * "latest state", not a queue — the system keeps only the newest, holds
 * it until the watch is reachable, and persists it on the watch across
 * launches. A palette pushed while the watch was in a drawer arrives
 * when it comes out, and one pushed twice arrives once.
 */
import { PainThemeId } from './theme';
import {
  PAIN_MAX, PAIN_MIN, getPainTheme, inkOn, painColor, painLabel, painRamp,
} from './painScale';
import { Entries, addDays, dailyAverage, dateFromISO, todayISO } from './model';

/** the week strip's length, the widget's */
export const WATCH_WEEK_DAYS = 7;
/** initials, Sunday-first to match Date.getDay() — the widget's letters */
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  /** the last seven local days, oldest first, today last: the fill the
   *  day's average wears, or '' for a day with nothing recorded */
  week: string[];
  /** the same seven days as weekday initials */
  weekLetters: string[];
}

export function watchContext(entries: Entries = {}, todayIso: string = todayISO()): WatchContext {
  const ramp = painRamp();
  const scores = Array.from({ length: PAIN_MAX - PAIN_MIN + 1 }, (_, i) => PAIN_MIN + i);
  const week: string[] = [];
  const weekLetters: string[] = [];
  for (let back = WATCH_WEEK_DAYS - 1; back >= 0; back--) {
    const day = addDays(todayIso, -back);
    const avg = dailyAverage(entries[day]);
    week.push(avg == null ? '' : painColor(avg));
    weekLetters.push(WD[dateFromISO(day).getDay()]);
  }
  return {
    v: WATCH_CONTEXT_VERSION,
    theme: getPainTheme(),
    ramp,
    ink: Array.from({ length: PAIN_MAX - PAIN_MIN + 1 }, (_, i) => inkOn(PAIN_MIN + i)),
    words: scores.map(painLabel),
    week,
    weekLetters,
  };
}
