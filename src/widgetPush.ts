/**
 * Pushing the snapshot across to the extension.
 *
 * Kept apart from widget.ts so the shape of what travels stays pure and
 * testable, and so a screen that only wanted to save a check-in can never
 * be brought down by a widget that is not installed.
 *
 * A TIMELINE, not a snapshot. Two entries go across: the record as of
 * now, and the same record read as of tomorrow, dated the first minute
 * of tomorrow. WidgetKit switches to the second one at midnight on its
 * own, so a home screen no longer shows yesterday's number as today's
 * until someone opens the app. See widgetEntries for the argument.
 */
import { Platform } from 'react-native';
import WeekWidget from './WeekWidget';
import * as db from './db';
import { Entries, todayISO } from './model';
import { fmtClock } from './clock';
import { LockMode, widgetEntries } from './widget';

/** the one widget preference: may the lock screen carry the number.
 *  Off until the person says otherwise — see LockMode. */
export const PREF_LOCK_NUMBER = 'widget.lockNumber';

export function lockMode(): LockMode {
  return db.getPref<boolean>(PREF_LOCK_NUMBER, false) ? 'number' : 'discreet';
}

/**
 * Safe to call often and safe to call anywhere. On Android, on a build
 * without the extension, or in a simulator with no widget placed, this
 * does nothing rather than throwing into a save.
 */
export function refreshWidget(entries: Entries, todayIso?: string): void {
  if (Platform.OS !== 'ios') return;
  try {
    const list = widgetEntries(entries, todayIso || todayISO(), new Date(), fmtClock, lockMode());
    /* the first widget build knew only updateSnapshot; that JS reaches
       it over the air, so the older call stays as the fallback */
    if (typeof WeekWidget.updateTimeline === 'function') {
      WeekWidget.updateTimeline(list.map((e) => ({ date: e.at, props: e.props })));
    } else {
      WeekWidget.updateSnapshot(list[0].props);
    }
  } catch {
    /* the widget is a nicety; the record is the product */
  }
}
