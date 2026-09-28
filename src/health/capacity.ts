/**
 * What you can do — each activity's level, the next small step, and the
 * minutes this week that went fine.
 *
 * WHY THIS EXISTS. Everything else in Pattern describes pain back to the
 * person, and a founder who uses it every day said so plainly (28 Sep
 * 2026): it shows me my pain and nothing else, and lately I see more of
 * it. A record that only ever reflects pain teaches attention to pain.
 * The goal was always to keep people active while pain is managed, and
 * the approach with the best evidence for that is pacing and graded
 * activity: find the amount of an activity that goes fine, do that on a
 * plan rather than on how today feels, and build in small steps. This
 * file is that, read from the record the app already keeps.
 *
 * A DECISION REVERSED, ON PURPOSE. workouts.ts and budget.ts say an
 * app-computed duration or a "do more" is advice wearing a number, and
 * for a description of the record that stays true. This is the one
 * place that says a next step, because the person asked for a tool
 * rather than a mirror. It keeps what made the old rule right: the
 * number comes only from the person's own sessions, the step is small
 * and fixed (thresholds.ts), it eases back on its own when sessions run
 * harder, and the card says it is not medical advice.
 *
 * "WENT FINE" IS TWO QUESTIONS, EITHER OF WHICH CAN ANSWER. After the
 * session: the first check-in after it ended against the last one before
 * it started — the windows workouts.ts already uses. The next morning:
 * the first morning check-in of the next day against this day's own
 * first morning check-in — morning against morning, the same time of
 * day, so a stiff start is compared with a stiff start. A session ran
 * harder when EITHER rose by CAPACITY_HARDER_POINTS or more; it went
 * fine when at least one answered and neither rose that far.
 *
 * THREE STATES, NEVER TWO. A session nobody checked in around is
 * `unknown`, not a failure: it counts toward nothing and nothing is said
 * about it. A session whose next morning has not happened yet is
 * `pending`. Neither is ever read as "ran harder".
 *
 * NOT A PAIN SCORE. Pain values are read only to decide fine or harder;
 * none is shown, averaged or combined here. What the card shows is
 * minutes and counts — non-pain measures, in neutral colour.
 */
import { Entries, Moment, addDays, logsOf, mondayOf } from '../model';
import {
  CAPACITY_EASE_AFTER, CAPACITY_HARDER_POINTS, CAPACITY_MIN_SESSIONS, CAPACITY_MIN_SESSION_MIN,
  CAPACITY_RECENT, CAPACITY_STEP, CAPACITY_STEP_MAX_MIN, CAPACITY_STEP_MIN_MIN,
  WORKOUT_AFTER_MAX_MIN, WORKOUT_BEFORE_WINDOW_MIN,
} from '../thresholds';
import { HealthDay } from './types';
import { morningPain } from './windows';
import { capitalise, workoutName } from './workoutNames';

export type SessionOutcome = 'fine' | 'harder' | 'pending' | 'unknown';

export interface Session {
  date: string;
  /** minutes since local midnight the session started */
  h: number;
  /** the activity's plain name — the grouping key, as in workouts.ts */
  activity: string;
  minutes: number;
  outcome: SessionOutcome;
}

/** after-the-session signal: the rise from the last check-in before the
 *  start to the first after the end, or null when either is missing */
function afterRise(logs: Moment[], start: number, end: number): number | null {
  let before: number | null = null;
  let after: number | null = null;
  logs.forEach((l) => {
    if (l.h <= start && start - l.h <= WORKOUT_BEFORE_WINDOW_MIN) before = l.pain;
    if (after == null && l.h >= end && l.h - end <= WORKOUT_AFTER_MAX_MIN) after = l.pain;
  });
  return before == null || after == null ? null : (after as number) - (before as number);
}

/**
 * Every session in the record, oldest first, each with its outcome.
 * Pure: entries, Health days and today's date in.
 *
 * Two sessions on one day share that day's next-morning signal — the
 * morning cannot say which of them it followed, so it is read for both.
 */
export function sessions(
  entries: Entries, health: Record<string, HealthDay>, todayIso: string
): Session[] {
  const out: Session[] = [];
  Object.keys(health).sort().forEach((date) => {
    /* a workout filed after today is a clock error, not a session */
    if (date > todayIso) return;
    const ws = (health[date].workouts || []).slice().sort((a, b) => a.h - b.h);
    if (!ws.length) return;
    const logs = logsOf(entries[date]).slice().sort((a, b) => a.h - b.h);
    const next = addDays(date, 1);
    const todayMorning = morningPain(logs);
    const nextMorning = morningPain(logsOf(entries[next]));
    const morningRise = todayMorning && nextMorning ? nextMorning.pain - todayMorning.pain : null;
    /* the next morning can still arrive while it is today or ahead —
       only then is a session without an answer waiting rather than
       unknown */
    const morningAhead = !nextMorning && next >= todayIso;

    ws.forEach((w) => {
      if (w.minutes < CAPACITY_MIN_SESSION_MIN) return;
      const rise = afterRise(logs, w.h, w.h + w.minutes);
      const signals = [rise, morningRise].filter((r): r is number => r != null);
      let outcome: SessionOutcome;
      if (signals.some((r) => r >= CAPACITY_HARDER_POINTS)) outcome = 'harder';
      /* a fine check-in after the session is half the answer: the
         morning is the other half, and pacing's own rule is the
         twenty-four hours after */
      else if (morningAhead) outcome = 'pending';
      else if (signals.length) outcome = 'fine';
      else outcome = 'unknown';
      out.push({
        date, h: w.h, activity: workoutName(w.activity), minutes: Math.round(w.minutes), outcome,
      });
    });
  });
  return out;
}

export type StepKind = 'up' | 'hold' | 'ease';

export interface ActivityLevel {
  activity: string;
  /** the typical length of the recent sessions that went fine, in
   *  minutes; with none fine, of the recent sessions at all */
  level: number;
  /** the suggested next session, in minutes */
  next: number;
  step: StepKind;
  /** recent sessions with a known outcome, and how many went fine */
  known: number;
  fine: number;
  /** the newest session's date — for ordering */
  last: string;
}

/** an activity short of its first level: what it is waiting for */
export interface ActivityCollecting {
  activity: string;
  known: number;
  needed: number;
  last: string;
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function stepOf(level: number): number {
  return Math.min(CAPACITY_STEP_MAX_MIN, Math.max(CAPACITY_STEP_MIN_MIN, Math.round(level * CAPACITY_STEP)));
}

/**
 * One activity's level and next step from its sessions (oldest first),
 * or null short of CAPACITY_MIN_SESSIONS known ones.
 *
 * THE STEP. Up by CAPACITY_STEP after the newest known session went
 * fine. Held after it ran harder — one harder morning is a day. Eased
 * back by the same step when CAPACITY_EASE_AFTER of the last three ran
 * harder, or none of the recent ones went fine. Never below the
 * shortest session that counts.
 */
export function activityLevel(activity: string, all: Session[]): ActivityLevel | null {
  const known = all.filter((s) => s.outcome === 'fine' || s.outcome === 'harder');
  if (known.length < CAPACITY_MIN_SESSIONS) return null;
  const recent = known.slice(-CAPACITY_RECENT);
  const fine = recent.filter((s) => s.outcome === 'fine');
  const level = Math.round(median((fine.length ? fine : recent).map((s) => s.minutes)));
  const lastThree = recent.slice(-3);
  const harderRecently = lastThree.filter((s) => s.outcome === 'harder').length;
  const newest = recent[recent.length - 1];

  let step: StepKind;
  let next: number;
  if (!fine.length || harderRecently >= CAPACITY_EASE_AFTER) {
    step = 'ease';
    next = Math.max(CAPACITY_MIN_SESSION_MIN, level - stepOf(level));
  } else if (newest.outcome === 'harder') {
    step = 'hold';
    next = level;
  } else {
    step = 'up';
    next = level + stepOf(level);
  }
  return {
    activity, level, next, step, known: recent.length, fine: fine.length,
    last: all[all.length - 1].date,
  };
}

export interface CapacityView {
  /** minutes this week (from Monday) in sessions that went fine */
  weekFineMinutes: number;
  /** minutes this week still waiting for the next morning */
  weekPendingMinutes: number;
  /** every activity with a level, most recently done first */
  levels: ActivityLevel[];
  /** activities short of a level, most recently done first */
  collecting: ActivityCollecting[];
}

/**
 * The whole card's data, or null when the record holds no session at
 * all — silence rather than an empty card.
 *
 * THE WEEK, NOT THE LAST SEVEN DAYS. A rolling seven days drops a
 * session on a day the person added nothing, which penalises a rest
 * day. From Monday, the number only grows until the week turns — and
 * nothing compares one week with another.
 */
export function capacityView(
  entries: Entries, health: Record<string, HealthDay>, todayIso: string
): CapacityView | null {
  const all = sessions(entries, health, todayIso);
  if (!all.length) return null;
  const week = mondayOf(todayIso);
  let weekFineMinutes = 0, weekPendingMinutes = 0;
  all.forEach((s) => {
    if (s.date < week) return;
    if (s.outcome === 'fine') weekFineMinutes += s.minutes;
    if (s.outcome === 'pending') weekPendingMinutes += s.minutes;
  });

  const by: Record<string, Session[]> = {};
  all.forEach((s) => { (by[s.activity] = by[s.activity] || []).push(s); });
  const levels: ActivityLevel[] = [];
  const collecting: ActivityCollecting[] = [];
  Object.keys(by).forEach((name) => {
    const l = activityLevel(name, by[name]);
    if (l) { levels.push(l); return; }
    collecting.push({
      activity: name,
      known: by[name].filter((s) => s.outcome === 'fine' || s.outcome === 'harder').length,
      needed: CAPACITY_MIN_SESSIONS,
      last: by[name][by[name].length - 1].date,
    });
  });
  /* most recent first, the name breaking ties, so the same record
     always reads in the same order */
  const order = (a: { last: string; activity: string }, b: { last: string; activity: string }) =>
    a.last !== b.last ? (a.last < b.last ? 1 : -1) : a.activity.localeCompare(b.activity);
  levels.sort(order);
  collecting.sort(order);
  return { weekFineMinutes, weekPendingMinutes, levels, collecting };
}

/* ── copy, from numbers ──────────────────────────────────────
   Fixed sentence shapes. Never "great job", never a verdict on today,
   never a pain number. */

export interface LevelCopy {
  title: string;
  /** what the record says about this activity */
  record: string;
  /** the next session */
  next: string;
}

export function levelCopy(l: ActivityLevel): LevelCopy {
  const title = capitalise(l.activity);
  const record = l.fine
    ? 'Went fine ' + l.fine + ' of the last ' + l.known + ' times. Usual length that went fine: '
      + l.level + ' min.'
    : 'The last ' + l.known + ' sessions ran harder afterwards. Usual length: ' + l.level + ' min.';
  let next: string;
  if (l.step === 'up') next = 'Next time, try ' + l.next + ' min.';
  else if (l.step === 'hold') next = 'The last one ran harder, so stay at ' + l.next + ' min next time.';
  else next = 'Try ' + l.next + ' min next time, and build back up from there.';
  return { title, record, next };
}

export function collectingCopy(c: ActivityCollecting): string {
  return capitalise(c.activity) + ': ' + c.known + ' of ' + c.needed + ' sessions with a check-in around them.';
}

/** the headline, in minutes — a count of living, never of pain */
export function weekLine(v: CapacityView): string {
  const base = v.weekFineMinutes
    ? 'This week: ' + v.weekFineMinutes + ' min of activity that went fine.'
    : 'This week: nothing with an answer yet.';
  return v.weekPendingMinutes
    ? base + ' ' + v.weekPendingMinutes + ' min waiting on tomorrow morning’s check-in.'
    : base;
}

/** what the card does not mean — inside the card, never a footnote */
export const CAPACITY_NOTE =
  '“Went fine” means your check-in after the session, or the next morning, was less than '
  + CAPACITY_HARDER_POINTS + ' points above the one before. Soreness after exercise is common '
  + 'and is not damage. The next step comes from your own record, in small steps — it is not '
  + 'medical advice, and a clinician’s plan comes first.';

/** how a session gets an answer — for the collecting rows */
export const CAPACITY_HOW =
  'A session gets an answer from a check-in before and after it, or from a morning check-in '
  + 'that day and the next. Sessions without one are left out, never counted against you.';
