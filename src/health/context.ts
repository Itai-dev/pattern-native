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
  CONTEXT_SLEEP_USUAL_DELTA_MIN, CONTEXT_STAND_USUAL_DELTA_MIN,
  CONTEXT_STEPS_USUAL_RATIO, CONTEXT_USUAL_MIN_DAYS, CONTEXT_USUAL_WINDOW_DAYS,
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

/* ── tiles: the same facts, shaped for the day's grid ────────
   One tile per category, value + label + optional "vs your usual" sub,
   derived from the same helpers as the lines so the two can never
   disagree about a number. The icon NAME travels as data — the UI picks
   the glyph, this file stays free of React. */

export interface HealthTile {
  key: string;
  /** Ionicons outline name — Pattern's icon grammar, never Apple's */
  icon: string;
  value: string;
  label: string;
  sub?: string;
}

/** Pattern's own reading of a State of Mind valence (−1…1), five plain
 *  bands. Descriptive of what the user logged in Health; never scored,
 *  never analysed, and the cutoffs are fixed so the same entry reads
 *  the same forever. */
export function valenceWord(v: number): string {
  if (v <= -0.6) return 'Very unpleasant';
  if (v <= -0.2) return 'Unpleasant';
  if (v < 0.2) return 'Neutral';
  if (v < 0.6) return 'Pleasant';
  return 'Very pleasant';
}

export function healthDayTiles(
  day: HealthDay | null | undefined,
  all?: Record<string, HealthDay>
): HealthTile[] {
  if (!day) return [];
  const out: HealthTile[] = [];

  if (day.sleepMinutes != null) {
    const usual = usualOf(all, day.date, (d) => d.sleepMinutes);
    let sub: string | undefined;
    if (usual != null) {
      const delta = day.sleepMinutes - usual;
      if (Math.abs(delta) >= CONTEXT_SLEEP_USUAL_DELTA_MIN) {
        sub = fmtDuration(Math.abs(Math.round(delta))) + (delta > 0 ? ' more' : ' less')
          + ' than usual';
      }
    }
    out.push({
      key: 'sleep', icon: 'moon-outline',
      value: fmtDuration(day.sleepMinutes),
      label: (day.sleepKind === 'inBed' ? 'In bed' : 'Asleep') + ', night before', sub,
    });
  }

  if (day.steps != null) {
    const usual = usualOf(all, day.date, (d) => d.steps);
    let sub: string | undefined;
    if (usual != null && usual > 0) {
      const ratio = (day.steps - usual) / usual;
      if (Math.abs(ratio) >= CONTEXT_STEPS_USUAL_RATIO) {
        sub = (ratio > 0 ? 'above' : 'below') + ' your usual '
          + Math.round(usual).toLocaleString('en-US');
      }
    }
    out.push({
      key: 'steps', icon: 'footsteps-outline',
      value: day.steps.toLocaleString('en-US'), label: 'Steps', sub,
    });
  }

  if (day.standMinutes != null) {
    const usual = usualOf(all, day.date, (d) => d.standMinutes);
    let sub: string | undefined;
    if (usual != null) {
      const delta = day.standMinutes - usual;
      if (Math.abs(delta) >= CONTEXT_STAND_USUAL_DELTA_MIN) {
        sub = fmtDuration(Math.abs(Math.round(delta))) + (delta > 0 ? ' more' : ' less')
          + ' than usual';
      }
    }
    out.push({
      key: 'stand', icon: 'body-outline',
      value: fmtDuration(day.standMinutes), label: 'Upright', sub,
    });
  }

  if (day.activeEnergyKcal != null) {
    out.push({
      key: 'energy', icon: 'flame-outline',
      value: String(Math.round(day.activeEnergyKcal)), label: 'kcal active',
    });
  }

  const w = day.workouts || [];
  if (w.length === 1) {
    out.push({
      key: 'workouts', icon: 'barbell-outline',
      value: fmtDuration(w[0].minutes), label: 'Workout',
    });
  } else if (w.length > 1) {
    const total = w.reduce((s, x) => s + x.minutes, 0);
    out.push({
      key: 'workouts', icon: 'barbell-outline',
      value: fmtDuration(total), label: w.length + ' workouts',
    });
  }

  if (day.restingHeartRate != null || day.hrvSDNN != null) {
    out.push({
      key: 'heart', icon: 'pulse-outline',
      value: day.restingHeartRate != null ? String(Math.round(day.restingHeartRate)) : '—',
      label: 'Resting HR',
      sub: day.hrvSDNN != null ? 'HRV ' + Math.round(day.hrvSDNN) + ' ms' : undefined,
    });
  }

  const som = day.stateOfMind || [];
  if (som.length) {
    const latest = som[som.length - 1];
    out.push({
      key: 'mind', icon: 'happy-outline',
      value: valenceWord(latest.valence), label: 'State of Mind',
      sub: som.length > 1 ? 'logged ' + som.length + '×' : undefined,
    });
  }

  return out;
}

/**
 * What Health already knows about a question the check-in is about to
 * ask — shown above the manual answer, never in place of it.
 *
 * "How was your sleep last night?" under a line that says "Apple
 * Health: 6h 40m asleep" is one question with two answers, and the
 * person still chooses the word. The manual level is what the focus
 * compares; the Health number is what makes choosing it honest rather
 * than a guess at 9pm. State of Mind does the same for the stress and
 * fatigue questions: a mood the person logged in Health this morning,
 * said back, before they rate the day. Pain is never compared with a
 * mood — that association runs backwards at least as often as forwards
 * — which is why this is a hint on a question and not a comparison.
 */
export function healthHintFor(metricId: string, day: HealthDay | null | undefined): string | null {
  if (!day) return null;
  if (metricId === 'sleep.quality.v1' && day.sleepMinutes != null) {
    return 'Apple Health: ' + fmtDuration(day.sleepMinutes)
      + (day.sleepKind === 'inBed' ? ' in bed' : ' asleep') + ' last night';
  }
  if ((metricId === 'stress.level.v1' || metricId === 'fatigue.level.v1')
    && day.stateOfMind && day.stateOfMind.length) {
    const latest = day.stateOfMind[day.stateOfMind.length - 1];
    return 'Apple Health: you logged “' + valenceWord(latest.valence) + '” today';
  }
  return null;
}

/** the one line Today may carry from Health: last night, which is over
 *  by the time anyone reads it. Steps are not here on purpose — they
 *  climb between two opens, and Today is the one surface that must not. */
export function lastNightLine(
  day: HealthDay | null | undefined, all?: Record<string, HealthDay>
): string | null {
  if (!day || day.sleepMinutes == null) return null;
  const lines = healthDayLines(day, all).filter((l) => l.key === 'sleep');
  return lines.length ? lines[0].text : null;
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
    let text = fmtDuration(day.sleepMinutes)
      + (day.sleepKind === 'inBed' ? ' in bed the night before' : ' asleep the night before');
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
  if (day.standMinutes != null) {
    /* "upright", said as measured — an unworn watch was a missing day,
       and this line simply is not there for it */
    let text = fmtDuration(day.standMinutes) + ' upright through the day';
    const usual = usualOf(all, day.date, (d) => d.standMinutes);
    if (usual != null) {
      const delta = day.standMinutes - usual;
      if (Math.abs(delta) >= CONTEXT_STAND_USUAL_DELTA_MIN) {
        text += ' — about ' + fmtDuration(Math.abs(Math.round(delta)))
          + (delta > 0 ? ' more' : ' less') + ' than your usual';
      }
    }
    out.push({ key: 'stand', text });
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
