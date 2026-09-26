/**
 * After your workouts — each workout, and the next morning's number.
 *
 * WHY THIS EXISTS. Everything on Patterns that talks about workouts is
 * gated: a comparison needs eight days a side, the budget needs the
 * comparison, and the first-days list disappears at four pairs. That is
 * right for a claim and wrong for the first month, which is exactly
 * when a person decides whether the app is worth opening. A person who
 * trains with pain already asks the question this list answers —
 * "what did Tuesday's run cost me on Wednesday?" — and answers it from
 * memory, badly. The record holds both halves. So the list shows them,
 * side by side, from the first workout, and keeps showing them after
 * the comparison forms, because a comparison is a summary and the
 * person will still want the rows.
 *
 * WHAT IT IS NOT. Not a comparison, not a score and not a trend. Each
 * row is two things the person did not have to re-enter — what Health
 * recorded, and the first morning check-in they entered — and nothing
 * between them is computed. No average across rows, no "usual", no
 * arrow: those belong to the engine, behind its gates, and a mean
 * printed here would be an ungated finding wearing a table.
 *
 * THE MORNING IS THE ENGINE'S. The outcome is `morningPain` from
 * windows.ts — the first check-in in the morning band of the day after
 * — so this list and the workout-load comparison can never disagree
 * about which number followed which workout.
 *
 * A MISSED MORNING IS NOT A ROW. A workout whose next morning passed
 * without a morning check-in is left out rather than shown as a gap:
 * a column of blanks reads as a list of failures, and nothing here may
 * penalise a missed day. The one exception is the newest workout while
 * its morning has not happened yet — that row says tomorrow's check-in
 * goes beside it, which is a reason to log, not a reproach.
 */
import { Entries, addDays, logsOf } from '../model';
import { AFTER_WORKOUTS_MAX_ROWS } from '../thresholds';
import { fmtDuration } from './context';
import { HealthDay } from './types';
import { morningPain } from './windows';
import { capitalise, workoutKinds } from './workoutNames';

export interface AfterWorkout {
  /** the date the workouts were filed under */
  date: string;
  /** what it was, plain words: "running" or "swimming, walking" */
  kinds: string;
  /** total minutes across the day's workouts */
  minutes: number;
  /** the next morning's first check-in as entered, or null while that
   *  morning is still ahead (only ever the newest row) */
  morning: number | null;
}

/**
 * Workout days with the next morning's pain, newest first.
 *
 * `todayIso` decides which mornings are still ahead: a workout filed
 * today or yesterday may not have its morning yet, and only the newest
 * such workout is kept, as the pending row. Anything older without a
 * morning is dropped — see the file comment.
 */
export function afterWorkouts(
  entries: Entries,
  health: Record<string, HealthDay>,
  todayIso: string
): AfterWorkout[] {
  const rows: AfterWorkout[] = [];
  Object.keys(health).sort().reverse().forEach((date) => {
    const w = health[date].workouts || [];
    if (!w.length) return;
    /* a workout filed after today is a clock error, not a row */
    if (date > todayIso) return;
    const next = addDays(date, 1);
    const e = entries[next];
    const m = e ? morningPain(logsOf(e)) : null;
    const minutes = Math.round(w.reduce((s, x) => s + x.minutes, 0));
    if (m) {
      rows.push({ date, kinds: workoutKinds(w).join(', '), minutes, morning: m.pain });
      return;
    }
    /* pending only for the NEWEST workout, and only while its morning
       is today (not yet logged) or still to come */
    if (!rows.length && next >= todayIso) {
      rows.push({ date, kinds: workoutKinds(w).join(', '), minutes, morning: null });
    }
  });
  return rows.slice(0, AFTER_WORKOUTS_MAX_ROWS);
}

/** the row's left half: "Running, walking — 45 min". A dash, not a
 *  comma, so a list of activities and its length do not run together */
export function workoutLabel(r: AfterWorkout): string {
  return capitalise(r.kinds) + ' — ' + fmtDuration(r.minutes);
}

/** what the list does not mean — inside the card, never a footnote */
export const AFTER_WORKOUTS_NOTE =
  'Each workout beside the first check-in of the next morning, as you entered it. '
  + 'A list, not a comparison: one morning says little about the workout before it, '
  + 'and mornings you did not check in are left out, not counted.';

/** the one line the card carries before it is opened */
export const AFTER_WORKOUTS_PENDING = 'next morning’s check-in goes here';
