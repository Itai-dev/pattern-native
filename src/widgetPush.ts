/**
 * Pushing the snapshot across to the extension.
 *
 * Kept apart from widget.ts so the shape of what travels stays pure and
 * testable, and so a screen that only wanted to save a check-in can never
 * be brought down by a widget that is not installed.
 */
import { Platform } from 'react-native';
import WeekWidget from './WeekWidget';
import { Entries, todayISO } from './model';
import { widgetSnapshot } from './widget';

/**
 * Safe to call often and safe to call anywhere. On Android, on a build
 * without the extension, or in a simulator with no widget placed, this
 * does nothing rather than throwing into a save.
 */
export function refreshWidget(entries: Entries, todayIso?: string): void {
  if (Platform.OS !== 'ios') return;
  try {
    WeekWidget.updateSnapshot(widgetSnapshot(entries, todayIso || todayISO()));
  } catch {
    /* the widget is a nicety; the record is the product */
  }
}
