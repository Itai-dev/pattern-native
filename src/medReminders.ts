/**
 * Medicine reminders — one local notification per time of day, with
 * Taken and Skipped on the banner.
 *
 * DAILY REPEATING, NOT A WEEK QUEUED. The check-in queue is seven dated
 * notifications per slot so that today's can be left out once a
 * check-in has answered it (reminders.ts). A medicine time does not
 * need "not today" — the dose is due whether or not the person opened
 * the app — so each time is one repeating trigger, which keeps the
 * total inside iOS's sixty-four beside the check-in queue.
 *
 * ONE PER TIME, NOT PER MEDICINE, AND NO NAME ON IT. Two medicines at
 * eight are one banner, "Your 8:00 medicines", and the lock screen
 * never names a medicine: what someone takes is exactly the kind of
 * thing a phone lying on a desk should not tell a colleague. The names
 * are in the app, one tap away.
 *
 * THE BUTTONS OPEN THE APP. Handling an action without opening it
 * needs a background task module this binary does not carry; a button
 * that silently did nothing on half the phones would be worse than one
 * that opens Pattern and records the answer there. Taken and Skipped
 * write for every medicine at that time; a different answer for one of
 * them is a tap on Today.
 */
import * as Notifications from 'expo-notifications';
import * as db from './db';
import { fmtClock } from './clock';
import { Medication } from './meds';
import { ensurePermission, hasPermission } from './reminders';

export const MED_CATEGORY = 'med';
const PREFIX = 'med-';

export async function registerMedCategory(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(MED_CATEGORY, [
      { identifier: 'taken', buttonTitle: 'Taken', options: { opensAppToForeground: true } },
      { identifier: 'skipped', buttonTitle: 'Skipped', options: { opensAppToForeground: true } },
    ]);
  } catch { /* an older runtime without categories still shows the banner */ }
}

export function isMedReminderId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.indexOf(PREFIX) === 0;
}

/** the times that carry a reminder, each with the medicines due then */
export function reminderTimes(meds: Medication[]): { slot: number; meds: Medication[] }[] {
  const by: Record<number, Medication[]> = {};
  meds.forEach((m) => {
    if (!m.remind) return;
    m.times.forEach((t) => { (by[t] = by[t] || []).push(m); });
  });
  return Object.keys(by).map(Number).sort((a, b) => a - b).map((slot) => ({ slot, meds: by[slot] }));
}

/** the banner's words — a time and a count, never a name */
export function reminderBody(slot: number, n: number): string {
  return 'Your ' + fmtClock(slot) + (n > 1 ? ' medicines (' + n + ')' : ' medicine') + '. Taken?';
}

/** rebuild the medicine reminders from the saved list. Never prompts —
 *  the sheet asks when a reminder is turned on. */
export async function syncMedReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const r of all) {
      if (isMedReminderId(r.identifier)) {
        try { await Notifications.cancelScheduledNotificationAsync(r.identifier); } catch { /* next */ }
      }
    }
  } catch { /* nothing to cancel we can see */ }
  const times = reminderTimes(db.getMedications());
  if (!times.length) return;
  if (!(await hasPermission())) return;
  for (const t of times) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: PREFIX + t.slot,
        content: {
          title: 'Pattern', body: reminderBody(t.slot, t.meds.length),
          categoryIdentifier: MED_CATEGORY, data: { slot: t.slot },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(t.slot / 60), minute: t.slot % 60,
        },
      });
    } catch { /* this one, not the rest */ }
  }
}

/** turning a reminder on: ask where the question explains itself */
export async function enableMedReminders(): Promise<boolean> {
  return ensurePermission();
}
