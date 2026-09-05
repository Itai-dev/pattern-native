/**
 * The saved reminder settings, applied to the phone's queue.
 *
 * One place that reads the preference, reads today's check-ins, and
 * rebuilds the queue — so the settings rows, the first-log offer on
 * Today and the app's own foreground refresh all schedule the same
 * thing from the same facts. reminders.ts knows nothing about the
 * database on purpose; this file is the seam between them.
 */
import * as db from './db';
import { logsOf, minutesNow, todayISO } from './model';
import {
  DEFAULT_SLOTS, SLOTS_PREF, Slot, ensurePermission, hasPermission, reschedule,
} from './reminders';

export function savedSlots(): Slot[] {
  return db.getPref<Slot[]>(SLOTS_PREF, DEFAULT_SLOTS);
}

export function anyReminderOn(): boolean {
  return savedSlots().some((s) => s.on);
}

/** rebuild the queue from what is saved. Never prompts: a permission
 *  sheet on launch or after a check-in is an ambush, and a slot that
 *  was never granted stays silent until the person turns one on. */
export async function syncReminders(): Promise<void> {
  const slots = savedSlots();
  if (!slots.some((s) => s.on)) return;
  if (!(await hasPermission())) return;
  const t = todayISO();
  await reschedule(slots, t, logsOf(db.getDay(t)).map((l) => l.h), minutesNow());
}

export type ApplyResult = 'on' | 'off' | 'denied';

/** save the slots, ask for permission if one is on and it was never
 *  granted, and rebuild the queue. The choice is stored before anything
 *  can fail, so a denied permission does not lose the setting. */
export async function applySlots(next: Slot[]): Promise<ApplyResult> {
  db.setPref(SLOTS_PREF, next);
  const wanted = next.filter((s) => s.on);
  if (!wanted.length) {
    await reschedule(next, todayISO(), [], minutesNow());
    return 'off';
  }
  if (!(await ensurePermission())) return 'denied';
  const t = todayISO();
  await reschedule(next, t, logsOf(db.getDay(t)).map((l) => l.h), minutesNow());
  return 'on';
}

/** the one-tap offer: the evening slot at its saved time, nothing else */
export async function enableEveningReminder(): Promise<ApplyResult> {
  return applySlots(savedSlots().map((s) => ({ ...s, on: s.key === 'e' })));
}
