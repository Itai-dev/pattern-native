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

/** initials, Sunday-first to match Date.getDay() */
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** the last seven local days, oldest first, as fills */
export function weekColors(entries: Entries, todayIso: string): string[] {
  const out: string[] = [];
  for (let back = WIDGET_DAYS - 1; back >= 0; back--) {
    const avg = dailyAverage(entries[addDays(todayIso, -back)]);
    out.push(avg == null ? WIDGET_EMPTY : painColor(avg));
  }
  return out;
}

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
}

/** everything the extension is told, in one object */
export function widgetSnapshot(entries: Entries, todayIso: string): WidgetSnapshot {
  const c = weekColors(entries, todayIso);
  const w = weekLetters(todayIso);
  /* the LATEST moment of today, by clock time — the same "what did I
     last say" the Today card leads with */
  const logs = logsOf(entries[todayIso] || null).slice().sort((a, b) => a.h - b.h);
  const last = logs.length ? logs[logs.length - 1] : null;
  return {
    d0: c[0], d1: c[1], d2: c[2], d3: c[3], d4: c[4], d5: c[5], d6: c[6],
    w0: w[0], w1: w[1], w2: w[2], w3: w[3], w4: w[4], w5: w[5], w6: w[6],
    caption: weekCaption(entries, todayIso),
    last: last ? formatScore(last.pain) : '',
    word: last ? painLabel(last.pain) : '',
    at: last ? fmtTime(last.h) : '',
    tint: last ? painColor(last.pain) : WIDGET_EMPTY,
  };
}
