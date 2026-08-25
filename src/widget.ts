/**
 * What the widget is given — the pure half.
 *
 * The widget cannot read the database: it lives in its own process, in
 * its own sandbox. What it gets is a snapshot pushed across the App Group
 * whenever the record changes, and that snapshot is deliberately thin —
 * seven colours and a caption. No pain values, no dates, no notes.
 *
 * The thinness is not only tidiness. Everything here leaves the app's own
 * container for a shared one, so the rule is the export's rule: the less
 * that travels, the less there is to be careless with. Seven hex strings
 * say the shape of a week and nothing about what was in it.
 *
 * This file is pure so the shape can be tested; widgetPush.ts holds the
 * part that talks to the extension.
 */
import { Entries, addDays, dailyAverage } from './model';
import { painColor } from './painScale';

/** a day with nothing recorded. A gap in this record means a day you did
 *  not log, and it has never been drawn as anything else. */
export const WIDGET_EMPTY = '#2E2E30';

export const WIDGET_DAYS = 7;

/** the last seven local days, oldest first, as fills */
export function weekColors(entries: Entries, todayIso: string): string[] {
  const out: string[] = [];
  for (let back = WIDGET_DAYS - 1; back >= 0; back--) {
    const avg = dailyAverage(entries[addDays(todayIso, -back)]);
    out.push(avg == null ? WIDGET_EMPTY : painColor(avg));
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
  caption: string;
}

/** everything the extension is told, in one object */
export function widgetSnapshot(entries: Entries, todayIso: string): WidgetSnapshot {
  const c = weekColors(entries, todayIso);
  return {
    d0: c[0], d1: c[1], d2: c[2], d3: c[3], d4: c[4], d5: c[5], d6: c[6],
    caption: weekCaption(entries, todayIso),
  };
}
