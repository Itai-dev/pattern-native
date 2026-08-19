/**
 * The three daily nudges — morning, midday, evening — as LOCAL notifications.
 *
 * This is the one place native plainly beats the web version. The PWA needs a
 * server, a push subscription and a cron sweep to say "check in", and it still
 * arrives whenever GitHub's scheduler gets round to it. Here iOS holds the
 * schedule itself: exact to the minute, working offline, in flight mode, with
 * no address stored anywhere and nothing leaving the phone.
 *
 * Each slot is scheduled as a repeating daily trigger, so one call covers
 * every future day; rescheduling clears and re-adds, which keeps the phone's
 * queue an exact mirror of the saved settings.
 */
import * as Notifications from 'expo-notifications';

export interface Slot {
  /** 'm' | 'd' | 'e' — the identifier is stable so a reschedule can replace it */
  key: 'm' | 'd' | 'e';
  hour: number;
  minute: number;
  on: boolean;
}

/* All off until asked for. A reminder that defaults to on would be scheduled
   before iOS has ever granted permission — silently dropped, with the user
   never prompted and never nudged. Turning one on is also what makes the
   permission question arrive at a moment that explains itself. */
export const DEFAULT_SLOTS: Slot[] = [
  { key: 'm', hour: 8, minute: 0, on: false },
  { key: 'd', hour: 13, minute: 0, on: false },
  { key: 'e', hour: 20, minute: 0, on: false },
];

/* the copy follows the hour it fires in — same voice, different moment.
   Every line is an offer, never an instruction. */
const COPY: Record<Slot['key'], string> = {
  m: 'Morning check-in — how is the day starting? Only if there is room for it.',
  d: 'Midday check-in — a few seconds, only if there is room for it.',
  e: 'Evening check-in — only if today has room for it. A missed day is just a missed day.',
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

/** replace the phone's queue with exactly the slots that are on */
export async function reschedule(slots: Slot[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const s of slots) {
    if (!s.on) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: 'pattern-' + s.key,
      content: { title: 'Pattern', body: COPY[s.key] },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: s.hour,
        minute: s.minute,
      },
    });
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
