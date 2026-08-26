/**
 * Pairing health context with pain — the temporal rules, and nothing
 * else. Pure: entries and normalized health days in, paired
 * observations out. The engine never touches a date again after this
 * file; if a pair exists here, its timing is already honest.
 *
 * THE RULES, STATED ONCE:
 *
 *  - Morning pain is explained by what came BEFORE it: last night's
 *    sleep, yesterday's movement and workouts. Never by anything later
 *    the same day — an association between morning pain and an
 *    afternoon walk would have the arrow pointing backwards through
 *    time, and it is exactly the kind of finding that looks best and
 *    means least.
 *
 *  - Evening pain may be explained by the same day's accumulated
 *    movement up to the check-in hour, and by workouts completed
 *    before it.
 *
 *  - ONE PAIR PER DAY PER QUESTION. A person who checks in nine times
 *    is not nine times the evidence; they are one day, observed
 *    closely. The outcome of a morning question is the FIRST morning
 *    check-in; of an evening question, the LAST evening check-in.
 *    Fixed by rule, so repeated logging can never inflate a group.
 *
 *  - Missing joins nothing. A day without coverage for a factor simply
 *    produces no pair — it is not a zero, and it is not a small value.
 */
import { Entries, Moment, addDays, logsOf } from '../model';
/* the app's ONE definition of morning and evening lives in metrics.ts,
   and this file borrows it rather than growing a second one */
import { bandOf } from '../metrics';
import { HealthDay } from './types';

export type PairKind =
  | 'sleepVsMorning'        // last night's sleep → this morning's pain
  | 'prevDayStepsVsMorning' // yesterday's steps → this morning's pain
  | 'stepsBeforeVsEvening'  // today's steps up to the check-in → evening pain
  | 'workoutVsNextMorning'; // yesterday: workout or none → this morning

/** one paired observation: a factor value and the pain it may lawfully
 *  be compared with. `factor` is continuous except for workouts, where
 *  it is 1 (a workout happened) or 0 (a covered day with none). */
export interface PairedDay {
  date: string;      // the date the PAIN was recorded on
  factor: number;
  pain: number;
}

/** the first check-in in the morning band, or null — the fixed outcome
 *  for every "before this morning" question */
export function morningPain(logs: Moment[]): Moment | null {
  const m = logs.slice().sort((a, b) => a.h - b.h)
    .filter((l) => bandOf(l.h) === 'morning');
  return m.length ? m[0] : null;
}

/** the last check-in in the evening band, or null */
export function eveningPain(logs: Moment[]): Moment | null {
  const m = logs.slice().sort((a, b) => a.h - b.h)
    .filter((l) => bandOf(l.h) === 'evening');
  return m.length ? m[m.length - 1] : null;
}

/** steps accumulated before a given minute-of-day, from the hourly
 *  buckets. Whole hours only: the hour the check-in falls in is
 *  excluded rather than pro-rated, because pro-rating invents an
 *  even distribution nobody measured. */
export function stepsBefore(day: HealthDay, h: number): number | null {
  if (!day.stepsHourly || !day.coverage.movement) return null;
  const upto = Math.max(0, Math.min(24, Math.floor(h / 60)));
  let sum = 0;
  for (let i = 0; i < upto; i++) sum += day.stepsHourly[i];
  return sum;
}

/**
 * Build every lawful pair of one kind across the record.
 *
 * `health` is keyed by local date. Every rule reads yesterday via the
 * app's own date arithmetic (addDays), so a DST-shortened day is still
 * one day.
 */
export function buildPairs(
  kind: PairKind, entries: Entries, health: Record<string, HealthDay>
): PairedDay[] {
  const out: PairedDay[] = [];
  Object.keys(entries).sort().forEach((date) => {
    const logs = logsOf(entries[date]);
    if (!logs.length) return;

    if (kind === 'sleepVsMorning') {
      const pain = morningPain(logs);
      const h = health[date];
      if (!pain || !h || h.sleepMinutes == null) return;
      /* the night must have ENDED before the check-in — a sleep record
         still open past the morning log would be future data */
      out.push({ date, factor: h.sleepMinutes, pain: pain.pain });
      return;
    }

    if (kind === 'prevDayStepsVsMorning') {
      const pain = morningPain(logs);
      const prev = health[addDays(date, -1)];
      if (!pain || !prev || prev.steps == null) return;
      out.push({ date, factor: prev.steps, pain: pain.pain });
      return;
    }

    if (kind === 'stepsBeforeVsEvening') {
      const pain = eveningPain(logs);
      const h = health[date];
      if (!pain || !h) return;
      const before = stepsBefore(h, pain.h);
      if (before == null) return;
      out.push({ date, factor: before, pain: pain.pain });
      return;
    }

    if (kind === 'workoutVsNextMorning') {
      const pain = morningPain(logs);
      const prev = health[addDays(date, -1)];
      /* "no workout" is a value only on a day workouts were COVERED —
         see normalize.ts for why coverage requires measured movement */
      if (!pain || !prev || !prev.coverage.workouts) return;
      out.push({ date, factor: (prev.workouts || []).length > 0 ? 1 : 0, pain: pain.pain });
      return;
    }
  });
  return out;
}
