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
  | 'sleepVsMorning'          // last night's sleep → this morning's pain
  | 'prevDayStepsVsMorning'   // yesterday's steps → this morning's pain
  | 'stepsBeforeVsEvening'    // today's steps up to the check-in → evening pain
  | 'workoutVsNextMorning'    // yesterday: workout or none → this morning
  /* Upright time accumulated before an evening check-in → that evening's
   * pain. UPRIGHT, not "sitting": the Watch measures standing, and an
   * hour without it could be a couch, a car, or a charger. The wording
   * everywhere keeps to what was measured. */
  | 'standBeforeVsEvening'
  /* Yesterday's workout LOAD → this morning, on workout days only: the
   * harder-than-usual vs lighter-than-usual question, split at the
   * person's own distribution. Load is TOTAL WORKOUT MINUTES, and the
   * word is "load", not "intensity", deliberately: duration is the one
   * measure HealthKit carries on every workout, while energy is absent
   * from many — and a comparison whose unit changes day to day is not a
   * comparison. Heart-rate-based intensity can refine this later. */
  | 'workoutLoadVsNextMorning';

/** one paired observation: a factor value and the pain it may lawfully
 *  be compared with. `factor` is continuous except for workouts, where
 *  it is 1 (a workout happened) or 0 (a covered day with none). */
export interface PairedDay {
  date: string;      // the date the PAIN was recorded on
  factor: number;
  pain: number;
  /** for sleep pairs: which quantity the factor is. One kind per
   *  record, never mixed — see buildPairs. */
  basis?: 'asleep' | 'inBed';
}

/** The one sleep quantity a record is compared on. Asleep when any
 *  night has it; in-bed only for a record that never saw an asleep
 *  interval (a phone with a schedule and no watch). Mixing the two
 *  would compare minutes in bed against minutes asleep as if they were
 *  the same number, and they are not. */
export function sleepBasis(health: Record<string, HealthDay>): 'asleep' | 'inBed' {
  const anyAsleep = Object.keys(health).some((k) =>
    health[k].sleepMinutes != null && (health[k].sleepKind || 'asleep') === 'asleep');
  return anyAsleep ? 'asleep' : 'inBed';
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

/** a quantity accumulated before a given minute-of-day, from hourly
 *  buckets. Whole hours only: the hour the check-in falls in is
 *  excluded rather than pro-rated, because pro-rating invents an
 *  even distribution nobody measured. */
function sumBefore(hourly: number[] | undefined, covered: boolean, h: number): number | null {
  if (!hourly || !covered) return null;
  const upto = Math.max(0, Math.min(24, Math.floor(h / 60)));
  let sum = 0;
  for (let i = 0; i < upto; i++) sum += hourly[i];
  return sum;
}

export function stepsBefore(day: HealthDay, h: number): number | null {
  return sumBefore(day.stepsHourly, !!day.coverage.movement, h);
}

export function standBefore(day: HealthDay, h: number): number | null {
  /* stand needs its own data present — movement coverage can come from
     the phone's steps while the wrist that measures standing was bare */
  return sumBefore(day.standHourly, day.standMinutes != null, h);
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
  const basis = kind === 'sleepVsMorning' ? sleepBasis(health) : undefined;
  Object.keys(entries).sort().forEach((date) => {
    const logs = logsOf(entries[date]);
    if (!logs.length) return;

    if (kind === 'sleepVsMorning') {
      const pain = morningPain(logs);
      const h = health[date];
      if (!pain || !h || h.sleepMinutes == null) return;
      if ((h.sleepKind || 'asleep') !== basis) return;
      /* the night must have ENDED before the check-in — a sleep record
         still open past the morning log would be future data. Checked
         on the moment's own instant when it carries one; a legacy
         moment without a stamp is kept, since unknown is not evidence
         of anything. */
      if (typeof pain.ts === 'number' && h.sleepEnd != null && h.sleepEnd > pain.ts) return;
      out.push({ date, factor: h.sleepMinutes, pain: pain.pain, basis });
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

    if (kind === 'standBeforeVsEvening') {
      const pain = eveningPain(logs);
      const h = health[date];
      if (!pain || !h) return;
      const before = standBefore(h, pain.h);
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

    if (kind === 'workoutLoadVsNextMorning') {
      const pain = morningPain(logs);
      const prev = health[addDays(date, -1)];
      /* workout DAYS only: this question is "harder vs lighter", and a
         day with no workout belongs to the other comparison, not to the
         bottom of this one */
      if (!pain || !prev || !prev.coverage.workouts) return;
      const w = prev.workouts || [];
      if (!w.length) return;
      const minutes = w.reduce((s, x) => s + x.minutes, 0);
      out.push({ date, factor: minutes, pain: pain.pain });
      return;
    }
  });
  return out;
}
