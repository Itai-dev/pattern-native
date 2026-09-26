/**
 * A workout beside the pain around it — the dose comparison's shape,
 * for the other kind of instant Health records.
 *
 * THE QUESTION. The day comparisons (windows.ts) ask what a workout
 * did to the NEXT MORNING: a day with one against a day without. That
 * is the question a clinician asks. The one the person asks, in the
 * changing room, is smaller and sooner: "what was my number before I
 * went in, and what is it now". A workout has a start and an end, so
 * each one is paired with the last check-in shortly before it started
 * and the first check-in after it ended — the same person, the same
 * afternoon, the same scale — and the comparison is the mean of those
 * paired differences. No groups of days: the control for a swim is
 * the check-in before that swim.
 *
 * GROUPED BY WHAT IT WAS. A swim and a run are not the same load on
 * the same body (workoutNames.ts), so pairs are kept per activity
 * name, the way doses are kept per medication, and each activity earns
 * its own sentence or none. Two codes that name the same activity are
 * one group — the name is the key, not the code.
 *
 * THE TRAP, NAMED. A workout happens on the days the person felt able
 * to, and pain moves through a day on its own — so "lower after"
 * arrives from selection as easily as from exercise, and "higher
 * after" from stiffness that would have come anyway. The card says so
 * beside the number. What this offers is a description of what the
 * record shows around workouts, never a claim about what the exercise
 * did — and "no change, across twelve sessions" is a finding about
 * those sessions, worth a clinician's minute either way.
 *
 * THE WINDOWS. The check-in before must be within
 * WORKOUT_BEFORE_WINDOW_MIN of the START, or it describes a different
 * afternoon. The check-in after must come AFTER THE END — a number
 * logged mid-session is neither side — and within WORKOUT_AFTER_MAX_MIN
 * of it. There is no floor on "after", unlike a dose: a tablet has
 * done nothing five minutes in, but a workout is complete when it
 * ends and the body's first word on it is already in — which is also
 * the moment the background prompt asks (background.ts). ONE PAIR PER
 * DAY PER ACTIVITY, the first workout that has a lawful pair.
 *
 * WHAT IT CAN NEVER RETURN: a recommendation, a duration, "keep it
 * up", "it helps", "it hurts". The load budget (budget.ts) is the one
 * forward-facing sentence about workouts and it stays there.
 */
import { Entries, logsOf } from '../model';
import {
  HEALTH_MIN_DELTA, WORKOUT_AFTER_MAX_MIN, WORKOUT_BEFORE_WINDOW_MIN, WORKOUT_EARLY_MIN_PAIRS,
  WORKOUT_MIN_PAIRS,
} from '../thresholds';
import { Verdict } from './engine';
import { HealthDay, NormalizedWorkout } from './types';
import { capitalise, workoutName } from './workoutNames';

/** one lawful workout pair: the check-in before it started, the first
 *  one after it ended */
export interface WorkoutPair {
  date: string;
  /** the activity's plain name — the grouping key */
  activity: string;
  before: number;
  after: number;
}

export interface WorkoutAssociation {
  activity: string;
  verdict: Verdict;
  /** lawful pairs seen at all */
  pairs: number;
  /** mean pain before and after, present from `observation` up */
  before?: number;
  after?: number;
  /** after minus before, rounded to 0.1 — negative is lower after */
  delta?: number;
  from?: string;
  to?: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** a day's workouts in the order they started */
function dayWorkouts(day: HealthDay | undefined): NormalizedWorkout[] {
  if (!day || !day.workouts) return [];
  return day.workouts.slice().sort((a, b) => a.h - b.h);
}

/**
 * Every lawful pair across the record — one per day per activity.
 * Pure: entries and normalized days in, pairs out.
 */
export function workoutPairs(entries: Entries, health: Record<string, HealthDay>): WorkoutPair[] {
  const out: WorkoutPair[] = [];
  Object.keys(entries).sort().forEach((date) => {
    const logs = logsOf(entries[date]).slice().sort((a, b) => a.h - b.h);
    if (!logs.length) return;
    const paired: Record<string, true> = {};
    dayWorkouts(health[date]).forEach((w) => {
      const name = workoutName(w.activity);
      if (paired[name]) return;
      const end = w.h + w.minutes;
      let before: number | null = null;
      let after: number | null = null;
      logs.forEach((l) => {
        if (l.h <= w.h && w.h - l.h <= WORKOUT_BEFORE_WINDOW_MIN) before = l.pain;
        if (after == null && l.h >= end && l.h - end <= WORKOUT_AFTER_MAX_MIN) after = l.pain;
      });
      if (before == null || after == null) return;
      paired[name] = true;
      out.push({ date, activity: name, before, after });
    });
  });
  return out;
}

/** evaluate one activity's pairs. `previouslyShown` feeds the fading
 *  rule and nothing else — a shown change that stops holding says so. */
export function evaluateWorkouts(
  activity: string, pairs: WorkoutPair[], previouslyShown = false
): WorkoutAssociation {
  const base: WorkoutAssociation = { activity, verdict: 'insufficient', pairs: pairs.length };
  const fade = (a: WorkoutAssociation): WorkoutAssociation =>
    previouslyShown && a.verdict !== 'possible' ? { ...a, verdict: 'fading' } : a;
  if (pairs.length < WORKOUT_MIN_PAIRS) return fade(base);
  const before = round1(mean(pairs.map((p) => p.before)));
  const after = round1(mean(pairs.map((p) => p.after)));
  const delta = round1(mean(pairs.map((p) => p.after - p.before)));
  const dates = pairs.map((p) => p.date).sort();
  const full: WorkoutAssociation = {
    ...base, verdict: 'observation', before, after, delta,
    from: dates[0], to: dates[dates.length - 1],
  };
  if (Math.abs(delta) < HEALTH_MIN_DELTA) return fade(full);
  return { ...full, verdict: 'possible' };
}

/** pairs by activity name, in name order — deterministic so the same
 *  record always reads the same */
function byActivity(entries: Entries, health: Record<string, HealthDay>): { name: string; pairs: WorkoutPair[] }[] {
  const by: Record<string, WorkoutPair[]> = {};
  workoutPairs(entries, health).forEach((p) => { (by[p.activity] = by[p.activity] || []).push(p); });
  return Object.keys(by).sort((a, b) => a.localeCompare(b)).map((name) => ({ name, pairs: by[name] }));
}

/** every activity with pairs, evaluated, in name order */
export function workoutAssociations(
  entries: Entries, health: Record<string, HealthDay>, previouslyShown: string[]
): WorkoutAssociation[] {
  return byActivity(entries, health)
    .map((g) => evaluateWorkouts(g.name, g.pairs, previouslyShown.indexOf(g.name) >= 0));
}

/** an activity's before/after picture before it has earned a sentence
 *  — WORKOUT_EARLY_MIN_PAIRS pairs and short of the gate */
export interface WorkoutEarly {
  activity: string;
  pairs: number;
  before: number;
  after: number;
  delta: number;
}

export function earlyWorkouts(entries: Entries, health: Record<string, HealthDay>): WorkoutEarly[] {
  return byActivity(entries, health)
    .filter((g) => g.pairs.length >= WORKOUT_EARLY_MIN_PAIRS && g.pairs.length < WORKOUT_MIN_PAIRS)
    .map((g) => {
      const before = round1(mean(g.pairs.map((p) => p.before)));
      const after = round1(mean(g.pairs.map((p) => p.after)));
      return { activity: g.name, pairs: g.pairs.length, before, after, delta: round1(after - before) };
    });
}

/** the first one or two pairs of an activity, listed as facts — before
 *  the early picture exists (see noticed.firstDays for the reasoning).
 *  This is where the first swim shows up: the number before, the
 *  number after, the day it was. */
export interface FirstWorkouts {
  activity: string;
  pairs: WorkoutPair[];
}

export function firstWorkouts(entries: Entries, health: Record<string, HealthDay>): FirstWorkouts[] {
  return byActivity(entries, health)
    .filter((g) => g.pairs.length >= 1 && g.pairs.length < WORKOUT_EARLY_MIN_PAIRS)
    .map((g) => ({ activity: g.name, pairs: g.pairs.slice().sort((a, b) => a.date < b.date ? 1 : -1) }));
}

/** the strongest `possible`, or null — one sentence, never a list */
export function strongestWorkout(all: WorkoutAssociation[]): WorkoutAssociation | null {
  let best: WorkoutAssociation | null = null;
  all.forEach((a) => {
    if (a.verdict !== 'possible' || a.delta == null) return;
    if (!best || Math.abs(a.delta) > Math.abs(best.delta as number)) best = a;
  });
  return best;
}

/** what each activity seen in Health is still waiting for — every
 *  activity with a workout in the record, short of the gate, so a
 *  person who trains but never checks in around it learns what one
 *  pair takes */
export interface WorkoutProgress {
  activity: string;
  pairs: number;
  needed: number;
}

export function workoutProgress(entries: Entries, health: Record<string, HealthDay>): WorkoutProgress[] {
  const seen: Record<string, true> = {};
  Object.keys(health).forEach((d) => {
    dayWorkouts(health[d]).forEach((w) => { seen[workoutName(w.activity)] = true; });
  });
  const counts: Record<string, number> = {};
  workoutPairs(entries, health).forEach((p) => { counts[p.activity] = (counts[p.activity] || 0) + 1; });
  return Object.keys(seen)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ activity: name, pairs: counts[name] || 0, needed: WORKOUT_MIN_PAIRS }))
    .filter((p) => p.pairs < p.needed);
}

/* ── copy, from numbers ──────────────────────────────────────
   Fixed sentence shapes, the numbers inserted; the selection line is
   part of the card, not a footnote, because it is the one thing that
   makes the number readable. */

export const WORKOUT_NON_CAUSATION =
  'A workout happens on the days you felt able to, and pain moves through a day on its own. '
  + 'This is what your record shows around workouts, not what the exercise did.';

function hours(m: number): string {
  return m % 60 === 0 ? (m / 60) + (m === 60 ? ' hour' : ' hours') : m + ' minutes';
}

function windowWords(): string {
  return 'a check-in within ' + hours(WORKOUT_BEFORE_WINDOW_MIN) + ' before it started and another within '
    + hours(WORKOUT_AFTER_MAX_MIN) + ' after it ended';
}

/** the timing sentence — the direction of time, spelled out */
export const WORKOUT_TIMING =
  'Each workout Health recorded is compared with your check-in shortly before it started and '
  + 'the first one after it ended. One workout a day is counted for each activity.';

export interface WorkoutCopy {
  title: string;
  body: string;
  sample: string;
  timing: string;
  disclaimer: string;
}

/** the card's words for a `possible` workout association; nothing for
 *  any other verdict, deliberately */
export function workoutCopy(a: WorkoutAssociation): WorkoutCopy | null {
  if (a.verdict !== 'possible' || a.delta == null) return null;
  const size = Math.abs(a.delta);
  const dir = a.delta < 0 ? 'lower' : 'higher';
  return {
    title: capitalise(a.activity) + ' may be worth watching',
    body: 'Your pain averaged ' + size + (size === 1 ? ' point ' : ' points ') + dir
      + ' at the first check-in after ' + a.activity + ' than at the one before it.',
    sample: 'Based on ' + a.pairs + ' workouts, each with ' + windowWords() + '.',
    timing: WORKOUT_TIMING,
    disclaimer: WORKOUT_NON_CAUSATION,
  };
}

/** the words for an observation whose pairs formed but did not differ */
export function workoutObservationCopy(a: WorkoutAssociation): string {
  return 'No meaningful change from before ' + a.activity + ' to after it, across '
    + a.pairs + ' workouts — that is a finding about these sessions, not a verdict on them.';
}

/** the "still collecting" row for an activity short of its gate */
export function workoutProgressCopy(p: WorkoutProgress): { title: string; evidence: string; caveat: string } {
  return {
    title: capitalise(p.activity) + ' and pain around a session',
    evidence: p.pairs + ' of ' + p.needed + ' workouts so far.',
    caveat: 'Each one takes ' + windowWords() + '.',
  };
}

/** the line for a previously shown activity that stopped holding */
export function fadedWorkoutCopy(a: WorkoutAssociation): string {
  return 'The earlier change around ' + a.activity
    + ' hasn’t stayed consistent as more workouts arrived. That happens, and it'
    + ' is worth knowing — it is why Pattern waits before saying anything.';
}
