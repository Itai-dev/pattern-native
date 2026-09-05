/**
 * The three daily nudges — morning, midday, evening — as LOCAL notifications.
 *
 * This is the one place native plainly beats the web version. The PWA needs a
 * server, a push subscription and a cron sweep to say "check in", and it still
 * arrives whenever GitHub's scheduler gets round to it. Here iOS holds the
 * schedule itself: exact to the minute, working offline, in flight mode, with
 * no address stored anywhere and nothing leaving the phone.
 *
 * ONE NOTIFICATION PER SLOT PER DAY, a week ahead, rebuilt often. The first
 * version scheduled each slot as a repeating daily trigger, which is one
 * call and no maintenance — and which cannot be told "not today". A person
 * who checked in at 19:40 still got "How intense is your pain right now?"
 * at 20:00, twenty minutes after answering it. So the queue is now seven
 * dated notifications per slot, and today's is left out when a check-in
 * already sits in that slot's part of the day. The queue is rebuilt on
 * every write and every foreground, so it never runs dry and never drifts
 * from the saved settings. Twenty-one is well inside iOS's limit of
 * sixty-four pending notifications.
 */
import * as Notifications from 'expo-notifications';
import { bandOf } from './metrics';
import { addDays } from './model';

export interface Slot {
  /** 'm' | 'd' | 'e' — the identifier is stable so a reschedule can replace it */
  key: 'm' | 'd' | 'e';
  hour: number;
  minute: number;
  on: boolean;
}

/** where the saved slots live, so the settings row and the first-log
 *  offer write the same preference */
export const SLOTS_PREF = 'reminders.slots';

/* All off until asked for. A reminder that defaults to on would be scheduled
   before iOS has ever granted permission — silently dropped, with the user
   never prompted and never nudged. Turning one on is also what makes the
   permission question arrive at a moment that explains itself. */
export const DEFAULT_SLOTS: Slot[] = [
  { key: 'm', hour: 8, minute: 0, on: false },
  { key: 'd', hour: 13, minute: 0, on: false },
  { key: 'e', hour: 20, minute: 0, on: false },
];

/** how many days ahead the queue reaches. A week: long enough that a
 *  phone left unopened over a holiday keeps its reminders, short enough
 *  to stay far inside the pending-notification limit. */
export const DAYS_AHEAD = 7;

/* the copy follows the hour it fires in — same voice, different moment.
   Every line is an offer, never an instruction. */
const COPY: Record<Slot['key'], string> = {
  /* each nudge asks the same question the check-in asks — about NOW, not
     about the whole day, because several of these arrive daily */
  m: 'How intense is your pain right now? A few seconds, only if there is room for it.',
  d: 'How intense is your pain right now? A few seconds, only if there is room for it.',
  e: 'How intense is your pain right now? A missed day is just a missed day.',
};

/** a delivered nudge should be quiet, not a banner that demands dismissal */
export function configureHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;      // denied for good — Settings only
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** already granted? — asked on launch, where prompting would be ambush */
export async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** is this identifier one of ours? A tap on it opens the check-in. */
export function isReminderId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.indexOf('pattern-') === 0;
}

/**
 * The dates a slot should fire on, from today. Pure, so the "not today"
 * rule can be tested: today is skipped when its time has passed, or when
 * one of today's check-ins already sits in the slot's part of the day.
 *
 * @param todayMinutes  the minute-of-day of each check-in made today
 * @param nowMinutes    the clock, so a slot already behind us is not
 *                      scheduled for a minute ago (iOS would fire it at once)
 */
export function slotDates(
  s: Slot, todayIso: string, todayMinutes: number[], nowMinutes: number
): string[] {
  const at = s.hour * 60 + s.minute;
  const answered = todayMinutes.some((h) => bandOf(h) === bandOf(at));
  const out: string[] = [];
  for (let d = 0; d < DAYS_AHEAD; d++) {
    if (d === 0 && (answered || at <= nowMinutes)) continue;
    out.push(addDays(todayIso, d));
  }
  return out;
}

/** replace the phone's queue with exactly the slots that are on, a week
 *  ahead, minus today's where today has already been answered */
export async function reschedule(
  slots: Slot[], todayIso: string, todayMinutes: number[], nowMinutes: number
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const s of slots) {
    if (!s.on) continue;
    for (const dateIso of slotDates(s, todayIso, todayMinutes, nowMinutes)) {
      const p = dateIso.split('-');
      const when = new Date(+p[0], +p[1] - 1, +p[2], s.hour, s.minute, 0, 0);
      await Notifications.scheduleNotificationAsync({
        identifier: 'pattern-' + s.key + '-' + dateIso,
        content: { title: 'Pattern', body: COPY[s.key] },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** what iOS actually holds — used to prove the schedule, not to guess at it */
export async function scheduledCount(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

export function fmt(s: Slot): string {
  return String(s.hour).padStart(2, '0') + ':' + String(s.minute).padStart(2, '0');
}
