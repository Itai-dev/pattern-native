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
import { Prompt, planDay } from './health/prompts';
import { deviceClock } from './health/healthkit';
import { storedHealthDays } from './health/sync';
import { fmtClock } from './clock';
import { CalendarEvent, calendarEvents } from './calendar';
import { DAYS_AHEAD } from './reminders';

/** "Follow Apple Health": on by default, because the whole point of a
 *  learned time is that nobody has to set it. Off returns the slots to
 *  the hours the person typed and drops the after-workout and
 *  after-dose prompts. */
export const ADAPTIVE_PREF = 'reminders.adaptive';

export function adaptiveOn(): boolean {
  return db.getPref<boolean>(ADAPTIVE_PREF, true);
}
export function setAdaptive(on: boolean): void {
  db.setPref(ADAPTIVE_PREF, on);
}

/** the planner the queue is built from — the saved slots, the stored
 *  Health days, the phone's clock, and the week's calendar when the
 *  person turned it on (an empty map otherwise, or on any failure) */
function planner(slots: Slot[], calendar: Record<string, CalendarEvent[]>): (dateIso: string) => Prompt[] {
  const health = storedHealthDays();
  const adaptive = adaptiveOn();
  return (dateIso) => planDay(dateIso, {
    slots, health, clock: deviceClock, adaptive, calendar: calendar[dateIso],
  });
}
async function plannerAsync(slots: Slot[]): Promise<(dateIso: string) => Prompt[]> {
  return planner(slots, await calendarEvents(todayISO(), DAYS_AHEAD));
}

/** today's plan, for the settings row to describe */
export async function plannedToday(): Promise<Prompt[]> {
  return (await plannerAsync(savedSlots()))(todayISO());
}

/** the plan as one line: the times, then what Health adds */
export function describePlan(prompts: Prompt[]): string {
  const times = prompts.filter((p) => p.kind === 'm' || p.kind === 'd' || p.kind === 'e')
    .map((p) => fmtClock(p.h) + (p.adapted ? '*' : ''));
  const extras: string[] = [];
  if (prompts.some((p) => p.kind === 'workout')) extras.push('after workouts');
  if (prompts.some((p) => p.kind === 'dose')) extras.push('after doses');
  if (prompts.some((p) => p.kind === 'calendar')) extras.push('after calendar events');
  return times.concat(extras).join(' · ');
}

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
  await reschedule(slots, t, logsOf(db.getDay(t)).map((l) => l.h), minutesNow(), await plannerAsync(slots));
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
  await reschedule(next, t, logsOf(db.getDay(t)).map((l) => l.h), minutesNow(), await plannerAsync(next));
  return 'on';
}

/** the one-tap offer: the evening slot at its saved time, nothing else */
export async function enableEveningReminder(): Promise<ApplyResult> {
  return applySlots(savedSlots().map((s) => ({ ...s, on: s.key === 'e' })));
}
