/**
 * What the widget is given — the pure half.
 *
 * The widget cannot read the database: it lives in its own process, in
 * its own sandbox. What it gets is a snapshot pushed across the App Group
 * whenever the record changes.
 *
 * WHAT TRAVELS, AND WHY IT GREW. The first version carried seven colours
 * and a caption, deliberately: the less that leaves the app's own
 * container, the less there is to be careless with. It now also carries
 * TODAY'S LATEST CHECK-IN — its number, its word, the time and its
 * colour — and seven weekday letters.
 *
 * That is a real change and it is argued, not drifted into. An App Group
 * is on the same phone, sandboxed to this app and its own extension;
 * nothing here reaches a network, which is the promise POSITIONING.md
 * makes and this keeps. And the widget was showing seven anonymous
 * squares — a shape with no scale and no dates, which cannot be read.
 * What is still refused is anything the user did not enter: no average,
 * no trend, no count of days logged, nothing derived.
 *
 * TODAY ONLY. If today has no check-in, no number travels at all. A
 * value from yesterday on today's home screen would be read as today's,
 * and a widget that quietly shows the wrong day is worse than one that
 * shows nothing.
 *
 * This file is pure so the shape can be tested; widgetPush.ts holds the
 * part that talks to the extension.
 */
import { Entries, addDays, dateFromISO, fmtTime, logsOf, dailyAverage } from './model';
import { formatScore, painColor, painLabel } from './painScale';

/** a day with nothing recorded. A gap in this record means a day you did
 *  not log, and it has never been drawn as anything else. */
export const WIDGET_EMPTY = '#2E2E30';

export const WIDGET_DAYS = 7;

/** the medium and large families draw more days: two rows of seven and
 *  five rows of seven, each row a week ending on today's weekday, so
 *  the letters under the last row name every column above them. Still
 *  only colours the user entered — a grid of days is the calendar, and
 *  the calendar is the one derived-nothing surface the calm rule allows. */
export const WIDGET_GRID_DAYS = 35;

/** initials, Sunday-first to match Date.getDay() */
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** the last N local days, oldest first, as fills */
function fillsBack(entries: Entries, todayIso: string, n: number): string[] {
  const out: string[] = [];
  for (let back = n - 1; back >= 0; back--) {
    const avg = dailyAverage(entries[addDays(todayIso, -back)]);
    out.push(avg == null ? WIDGET_EMPTY : painColor(avg));
  }
  return out;
}

/** the last seven local days, oldest first, as fills */
export function weekColors(entries: Entries, todayIso: string): string[] {
  return fillsBack(entries, todayIso, WIDGET_DAYS);
}

/** the last thirty-five, oldest first — the last seven of these are
 *  exactly weekColors, so the small widget and the big one agree */
export function gridColors(entries: Entries, todayIso: string): string[] {
  return fillsBack(entries, todayIso, WIDGET_GRID_DAYS);
}

/** what the accessory families may say. 'number' puts the score on the
 *  lock screen; anything else keeps it to a square and a word. Off by
 *  default: a lock screen is read by whoever lifts the phone, and the
 *  spec's rule for notifications — no pain scores on the lock screen —
 *  was written before the widget existed and applies to it just as
 *  well. The person turns the number on in Profile if they want it. */
export type LockMode = 'number' | 'discreet';

/** the same seven days as letters, so the strip can be read as days
 *  rather than as decoration. The last one is always today. */
export function weekLetters(todayIso: string): string[] {
  const out: string[] = [];
  for (let back = WIDGET_DAYS - 1; back >= 0; back--) {
    out.push(WD[dateFromISO(addDays(todayIso, -back)).getDay()]);
  }
  return out;
}

/** The one line of words. It states what is true and asks for nothing —
 *  "you haven't logged today" would be a nudge on a surface the user
 *  cannot dismiss, which is the one thing a home screen must not do. */
export function weekCaption(entries: Entries, todayIso: string): string {
  return dailyAverage(entries[todayIso]) == null ? 'Check in' : 'Checked in today';
}

export interface WidgetSnapshot {
  d0: string; d1: string; d2: string; d3: string; d4: string; d5: string; d6: string;
  w0: string; w1: string; w2: string; w3: string; w4: string; w5: string; w6: string;
  caption: string;
  /** today's latest check-in, or '' when today has none. The VALUE the
   *  user entered, never an average of anything. */
  last: string;
  /** its word on the shared scale — the same five painScale uses */
  word: string;
  /** and when, as the app writes a time everywhere else */
  at: string;
  /** its colour. A pain value, so it may wear the ramp; every other
   *  figure a widget could show may not, which is why there are none. */
  tint: string;
  /** whether the lock screen may carry the number — see LockMode */
  lock: LockMode;
  /** the thirty-five-day grid, g0 oldest … g34 today, for the medium
   *  and large families. Flat keys, because the snapshot crosses the
   *  App Group as a plist and the layout reads props by name. */
  [k: `g${number}`]: string;
}

/**
 * The timeline: now, and the first minute of tomorrow.
 *
 * The snapshot is pushed only when the app writes, and nothing ran at
 * midnight — so from 00:00 until the app was next opened, the home
 * screen showed yesterday's latest check-in labelled with yesterday's
 * time as if it were today's, and the seven letters were a day stale.
 * "TODAY ONLY" is a promise the extension cannot keep on its own; this
 * hands it the second entry it needs. Both entries are the same pure
 * function of the same record, one asked about tomorrow.
 */
export interface WidgetEntry {
  /** the local calendar day this entry is FOR */
  dateIso: string;
  /** when the extension should switch to it */
  at: Date;
  props: WidgetSnapshot;
}

export function widgetEntries(
  entries: Entries, todayIso: string, now: Date,
  clock: (h: number) => string = fmtTime, lock: LockMode = 'discreet'
): WidgetEntry[] {
  const tomorrowIso = addDays(todayIso, 1);
  const midnight = dateFromISO(tomorrowIso);   // local 00:00 of tomorrow
  return [
    { dateIso: todayIso, at: now, props: widgetSnapshot(entries, todayIso, clock, lock) },
    { dateIso: tomorrowIso, at: midnight, props: widgetSnapshot(entries, tomorrowIso, clock, lock) },
  ];
}

/** everything the extension is told, in one object. `clock` writes the
 *  time: the fixed form by default (so this stays testable), the
 *  phone's own convention when the app pushes it. */
export function widgetSnapshot(
  entries: Entries, todayIso: string,
  clock: (h: number) => string = fmtTime, lock: LockMode = 'discreet'
): WidgetSnapshot {
  const c = weekColors(entries, todayIso);
  const w = weekLetters(todayIso);
  /* the LATEST moment of today, by clock time — the same "what did I
     last say" the Today card leads with */
  const logs = logsOf(entries[todayIso] || null).slice().sort((a, b) => a.h - b.h);
  const last = logs.length ? logs[logs.length - 1] : null;
  const snap: WidgetSnapshot = {
    d0: c[0], d1: c[1], d2: c[2], d3: c[3], d4: c[4], d5: c[5], d6: c[6],
    w0: w[0], w1: w[1], w2: w[2], w3: w[3], w4: w[4], w5: w[5], w6: w[6],
    caption: weekCaption(entries, todayIso),
    last: last ? formatScore(last.pain) : '',
    word: last ? painLabel(last.pain) : '',
    at: last ? clock(last.h) : '',
    tint: last ? painColor(last.pain) : WIDGET_EMPTY,
    lock,
  };
  gridColors(entries, todayIso).forEach((fill, i) => { snap[`g${i}`] = fill; });
  return snap;
}
