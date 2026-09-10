/**
 * The calendar, read-only, for the one thing it knows that Health does
 * not: what is COMING. Health can say a workout usually ends at six on
 * Tuesdays; the calendar says there is a class at five today and a
 * long drive on Friday. The titles and times of the next week's events
 * are read, classified by a short keyword list (health/prompts.ts),
 * and the ones that read as exertion earn an after-event prompt in
 * the same plan the Health habits feed. Nothing is written, nothing
 * is stored beyond the plan, and no title ever leaves the phone or
 * appears in a notification.
 *
 * GUARDED LIKE HEALTHKIT. expo-calendar is a native module; binaries
 * installed before it shipped have no such module and an unguarded
 * require crashes them at launch, over the air. So it is required
 * lazily inside try/catch, `available()` is false on those phones, and
 * the Profile row simply is not there until the newest build.
 */
import { Platform } from 'react-native';
import * as db from './db';
import { addDays, iso } from './model';

/** one event as the planner reads it, filed by local date */
export interface CalendarEvent {
  /** minutes since local midnight the event starts */
  h: number;
  minutes: number;
  title: string;
  /** the store's id and the start as epoch ms — what Apple's editor
   *  needs to open THIS event, a recurring one's instance included */
  id?: string;
  start?: number;
}

type Cal = {
  getCalendarPermissions: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestCalendarPermissions: () => Promise<{ granted: boolean }>;
  getCalendars: (t?: unknown) => Promise<{ id: string }[]>;
  listEvents: (cals: { id: string }[] | string[], from: Date, to: Date) => Promise<{
    id?: string; title?: string; startDate?: Date | string; endDate?: Date | string; allDay?: boolean;
  }[]>;
  /** Apple's own event editor, prefilled with an existing event —
   *  absent on an older module, and the card then has no action */
  editEventInCalendarAsync?: (params: { id: string; instanceStartDate?: Date }) => Promise<{ action?: string }>;
};

const LIB: Cal | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-calendar');
    return (m && typeof m.listEvents === 'function') ? (m as Cal) : null;
  } catch {
    return null; // a binary without the module — the row waits for TestFlight
  }
})();

/** "Use my calendar", the person's choice — off until they turn it on,
 *  and the permission is asked only then, where the question explains
 *  itself */
export const CALENDAR_PREF = 'calendar.on';

export function calendarAvailable(): boolean {
  return !!LIB;
}
export function calendarOn(): boolean {
  return !!LIB && db.getPref<boolean>(CALENDAR_PREF, false);
}
export function setCalendarOn(on: boolean): void {
  db.setPref(CALENDAR_PREF, on);
}

/** ask iOS, once, when the switch goes on. Resolves false when denied
 *  for good — Settings is the only way back then, and the row says so. */
export async function requestCalendar(): Promise<boolean> {
  if (!LIB) return false;
  try {
    const cur = await LIB.getCalendarPermissions();
    if (cur.granted) return true;
    const r = await LIB.requestCalendarPermissions();
    return !!r.granted;
  } catch { return false; }
}

/** can this binary open Apple's editor on an event? */
export function calendarEditable(): boolean {
  return !!LIB && typeof LIB.editEventInCalendarAsync === 'function';
}

export type EditResult = 'saved' | 'canceled' | 'deleted' | 'unavailable';

/**
 * Open Apple's own event editor on one event. PATTERN NEVER WRITES:
 * the sheet is iOS's, prefilled with the event as it stands, and only
 * the person's tap on Save changes anything. The result says what
 * they did, so a saved change can be counted — never what it was.
 * Every failure is 'unavailable', and the card that called this
 * simply stays as it is.
 */
export async function editEventInCalendar(ev: CalendarEvent): Promise<EditResult> {
  if (!LIB || typeof LIB.editEventInCalendarAsync !== 'function' || !ev.id) return 'unavailable';
  try {
    const r = await LIB.editEventInCalendarAsync({
      id: ev.id, ...(ev.start != null ? { instanceStartDate: new Date(ev.start) } : {}),
    });
    const a = r && r.action;
    return a === 'saved' || a === 'deleted' ? a : 'canceled';
  } catch { return 'unavailable'; }
}

const ts = (v: unknown): number | null => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') { const n = new Date(v).getTime(); return isNaN(n) ? null : n; }
  return null;
};

/**
 * The next `days` days' timed events, keyed by local date. All-day
 * events are left out — a birthday has no "after". Every failure is a
 * silent empty map: the plan then simply has no calendar in it.
 */
export async function calendarEvents(fromIso: string, days: number): Promise<Record<string, CalendarEvent[]>> {
  const out: Record<string, CalendarEvent[]> = {};
  if (!calendarOn() || !LIB) return out;
  try {
    if (!(await LIB.getCalendarPermissions()).granted) return out;
    const cals = await LIB.getCalendars();
    if (!cals.length) return out;
    const p = fromIso.split('-');
    const from = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0, 0);
    const q = addDays(fromIso, days).split('-');
    const to = new Date(+q[0], +q[1] - 1, +q[2], 0, 0, 0, 0);
    const events = await LIB.listEvents(cals, from, to);
    events.forEach((e) => {
      if (e.allDay) return;
      const s = ts(e.startDate), en = ts(e.endDate);
      if (s == null || en == null || !e.title) return;
      const d = new Date(s);
      const date = iso(d);
      const ev: CalendarEvent = {
        h: d.getHours() * 60 + d.getMinutes(),
        minutes: Math.max(1, Math.round((en - s) / 60000)),
        title: String(e.title),
        ...(e.id ? { id: String(e.id), start: s } : {}),
      };
      (out[date] = out[date] || []).push(ev);
    });
  } catch { /* no calendar in the plan */ }
  return out;
}
