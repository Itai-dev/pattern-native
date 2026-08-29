/**
 * One day's health context, as lines a person reads — the descriptive
 * layer, wholly separate from the engine.
 *
 * This is what makes the Health connection worth something on the FIRST
 * morning: wake, check in, and last night's sleep is sitting beside the
 * pain it preceded. No claim is made and none is implied — these are
 * the day's own facts, shown on the day's own page, and the fine print
 * beside them says exactly what they are not.
 *
 * It lives on the DAY DETAIL and deliberately not on Today: steps rise
 * on their own through the day, and a number that climbs between two
 * opens of the acting surface is the self-updating loop the calm rules
 * exist to prevent. A day you navigate to is a place you look; Today is
 * where you act.
 *
 * Workout activity names arrive from HealthKit as numeric type codes;
 * translating all eighty of them buys nothing a count and minutes do
 * not, so workouts summarize as time — "45-min workout", "2 workouts ·
 * 63 min". Deterministic like every generated sentence here: same day,
 * same lines.
 */
import {
  CONTEXT_SLEEP_USUAL_DELTA_MIN, CONTEXT_STEPS_USUAL_RATIO,
  CONTEXT_USUAL_MIN_DAYS, CONTEXT_USUAL_WINDOW_DAYS,
} from '../thresholds';
import { addDays } from '../model';
import { HealthDay } from './types';

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return m + ' min';
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

export interface HealthLine {
  key: string;
  text: string;
}

/** The person's own recent baseline for one field: the mean over the
 *  CONTEXT_USUAL_WINDOW_DAYS before (never including) the day being
 *  described, and only once CONTEXT_USUAL_MIN_DAYS of it exist. The day
 *  itself stays out of its own baseline — a night compared against an
 *  average it is part of understates every deviation. */
function usualOf(
  all: Record<string, HealthDay> | undefined,
  date: string,
  read: (d: HealthDay) => number | undefined
): number | null {
  if (!all) return null;
  const from = addDays(date, -CONTEXT_USUAL_WINDOW_DAYS);
  const vals: number[] = [];
  Object.keys(all).forEach((k) => {
    if (k >= date || k < from) return;
    const v = read(all[k]);
    if (v != null) vals.push(v);
  });
  if (vals.length < CONTEXT_USUAL_MIN_DAYS) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/**
 * The lines for one day, in a fixed order, only where data exists — an
 * uncovered category is simply not a line, never a zero.
 *
 * With `all` days provided, sleep and steps also read against the
 * person's own usual — Apple's card grammar, held to this app's rule:
 * the comparison describes the FACTOR and never touches pain. The pain
 * sits two lines above on the same page; the reader may notice the two
 * move together, and that is theirs to notice. The app joins them in a
 * sentence only when fourteen days have earned it.
 */
export function healthDayLines(
  day: HealthDay | null | undefined,
  all?: Record<string, HealthDay>
): HealthLine[] {
  if (!day) return [];
  const out: HealthLine[] = [];
  if (day.sleepMinutes != null) {
    let text = fmtDuration(day.sleepMinutes) + ' asleep the night before';
    const usual = usualOf(all, day.date, (d) => d.sleepMinutes);
    if (usual != null) {
      const delta = day.sleepMinutes - usual;
      if (Math.abs(delta) >= CONTEXT_SLEEP_USUAL_DELTA_MIN) {
        text += ' — about ' + fmtDuration(Math.abs(Math.round(delta)))
          + (delta > 0 ? ' more' : ' less') + ' than your usual';
      }
    }
    out.push({ key: 'sleep', text });
  }
  if (day.steps != null) {
    let text = day.steps.toLocaleString('en-US') + ' steps';
    const usual = usualOf(all, day.date, (d) => d.steps);
    if (usual != null && usual > 0) {
      const ratio = (day.steps - usual) / usual;
      if (Math.abs(ratio) >= CONTEXT_STEPS_USUAL_RATIO) {
        text += ' — ' + (ratio > 0 ? 'above' : 'below') + ' your usual (about '
          + Math.round(usual).toLocaleString('en-US') + ')';
      }
    }
    out.push({ key: 'steps', text });
  }
  if (day.distanceMeters != null && day.distanceMeters >= 100) {
    out.push({
      key: 'distance',
      text: (Math.round(day.distanceMeters / 100) / 10).toFixed(1) + ' km on foot',
    });
  }
  if (day.activeEnergyKcal != null) {
    out.push({ key: 'energy', text: Math.round(day.activeEnergyKcal) + ' kcal active energy' });
  }
  const w = day.workouts || [];
  if (w.length === 1) {
    out.push({ key: 'workouts', text: fmtDuration(w[0].minutes) + ' workout' });
  } else if (w.length > 1) {
    const total = w.reduce((s, x) => s + x.minutes, 0);
    out.push({ key: 'workouts', text: w.length + ' workouts · ' + fmtDuration(total) + ' total' });
  }
  if (day.restingHeartRate != null) {
    out.push({ key: 'rhr', text: 'Resting heart rate ' + Math.round(day.restingHeartRate) });
  }
  if (day.hrvSDNN != null) {
    out.push({ key: 'hrv', text: 'HRV ' + Math.round(day.hrvSDNN) + ' ms' });
  }
  return out;
}
