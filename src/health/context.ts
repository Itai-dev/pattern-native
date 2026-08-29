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

/** the lines for one day, in a fixed order, only where data exists —
 *  an uncovered category is simply not a line, never a zero */
export function healthDayLines(day: HealthDay | null | undefined): HealthLine[] {
  if (!day) return [];
  const out: HealthLine[] = [];
  if (day.sleepMinutes != null) {
    out.push({ key: 'sleep', text: fmtDuration(day.sleepMinutes) + ' asleep the night before' });
  }
  if (day.steps != null) {
    out.push({ key: 'steps', text: day.steps.toLocaleString('en-US') + ' steps' });
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
