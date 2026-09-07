/**
 * Prompts at the moment, not at the habit — HealthKit background
 * delivery, the native half of "ask at the right time".
 *
 * The planner (prompts.ts) schedules after-workout and after-dose
 * prompts at the hour those things USUALLY happen. This file is what
 * makes them happen at the hour they DID: iOS wakes Pattern when a
 * workout or a night's sleep lands in the store, the day is
 * re-derived, and if the thing just ended and nobody has checked in
 * since, one notification goes out now. The planned prompt for that
 * habit is then already answered by the time it would fire, and the
 * queue's own "already answered" rule silences it.
 *
 * NEEDS THE ENTITLEMENT. Background delivery is
 * com.apple.developer.healthkit.background-delivery, added to the
 * binary by the HealthKit plugin's `background: true` (app.json). On a
 * binary built without it every call below fails and is caught, and
 * the planned prompts carry on alone — this file is additive, over
 * the air, the same way the HealthKit module itself was.
 *
 * UNVERIFIED ON A DEVICE. Whether the JavaScript runtime is up when
 * iOS delivers a background update to a React Native app is the
 * library's promise, not this file's; the first binary with the
 * entitlement is where it gets tested. Every path here degrades to
 * "nothing happened", never to a crash and never to a duplicate.
 *
 * WHAT IT MAY NOT DO: prompt more than BG_PROMPTS_MAX_PER_DAY times a
 * day, prompt within PROMPT_MIN_GAP_MIN of a check-in, name a
 * medication, or prompt for anything that ended more than
 * BG_PROMPT_STALE_MIN ago — a workout the store delivered three hours
 * late is context for the day, not a moment to ask about.
 */
import * as Notifications from 'expo-notifications';
import * as db from '../db';
import { logsOf, minutesNow, todayISO } from '../model';
import {
  BG_PROMPTS_MAX_PER_DAY, BG_PROMPT_STALE_MIN, PROMPT_AFTER_WAKE_MIN, PROMPT_MIN_GAP_MIN,
} from '../thresholds';
import { deviceClock, startBackgroundDelivery } from './healthkit';
import { healthCategories, healthRequestedOn, syncHealth } from './sync';
import { HealthCategory, HealthDay, HealthService } from './types';

const COPY: Record<'workout' | 'sleep', string> = {
  workout: 'Your workout just ended. How intense is your pain right now?',
  sleep: 'Good morning. How intense is your pain right now? Last night is already beside it.',
};

/** how many background prompts went out today — a pref, so a killed
 *  and relaunched process still counts the ones before it */
function sentToday(): number {
  const t = todayISO();
  return db.getPref<{ date: string; n: number }>('bg.prompts', { date: '', n: 0 }).date === t
    ? db.getPref<{ date: string; n: number }>('bg.prompts', { date: '', n: 0 }).n : 0;
}
function countSent(): void {
  db.setPref('bg.prompts', { date: todayISO(), n: sentToday() + 1 });
}

/** a check-in within the gap of now already answers the question */
function answeredRecently(now: number): boolean {
  return logsOf(db.getDay(todayISO())).some((l) => Math.abs(l.h - now) < PROMPT_MIN_GAP_MIN);
}

async function prompt(kind: 'workout' | 'sleep'): Promise<void> {
  const now = minutesNow();
  if (sentToday() >= BG_PROMPTS_MAX_PER_DAY || answeredRecently(now)) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  countSent();
  await Notifications.scheduleNotificationAsync({
    /* the reminder prefix: a tap opens the check-in like any other */
    identifier: 'pattern-bg-' + kind + '-' + todayISO() + '-' + now,
    content: { title: 'Pattern', body: COPY[kind], categoryIdentifier: 'checkin' },
    trigger: null,
  });
}

/** did today's record just gain a workout that ended a moment ago? */
function workoutJustEnded(day: HealthDay | null, now: number): boolean {
  if (!day || !day.workouts) return false;
  return day.workouts.some((w) => {
    const end = w.h + w.minutes;
    return end <= now && now - end <= BG_PROMPT_STALE_MIN;
  });
}

/** did last night just end — the person is up, and the night is in? */
function justWoke(day: HealthDay | null, now: number): boolean {
  if (!day || day.sleepEnd == null) return false;
  const end = deviceClock.minutesOf(day.sleepEnd);
  return deviceClock.dateOf(day.sleepEnd) === day.date
    && end <= now && now - end >= PROMPT_AFTER_WAKE_MIN / 2 && now - end <= BG_PROMPT_STALE_MIN;
}

/**
 * Start listening. Returns the stop function. Safe to call on any
 * binary: without the entitlement or the module nothing subscribes.
 */
export function startBackgroundPrompts(service: HealthService): () => void {
  const cats = healthCategories();
  if (!service.available() || !healthRequestedOn() || !cats.length) return () => {};
  const wanted = cats.filter((c): c is HealthCategory => c === 'workouts' || c === 'sleep');
  if (!wanted.length) return () => {};
  return startBackgroundDelivery(wanted, (category) => {
    /* re-derive the day first, so the prompt is about what is now in
       the record and the check-in it invites shows it under the number */
    syncHealth(service, deviceClock).then(() => {
      const day = db.getHealthDay<HealthDay>(todayISO());
      const now = minutesNow();
      if (category === 'workouts' && workoutJustEnded(day, now)) return prompt('workout');
      if (category === 'sleep' && justWoke(day, now)
        && logsOf(db.getDay(todayISO())).length === 0) return prompt('sleep');
      return undefined;
    }).catch(() => { /* a missed prompt is a missed prompt */ });
  });
}
