/**
 * Raw samples in, one honest day out.
 *
 * Everything here is pure and clock-injected: no HealthKit, no React
 * Native, no Date.now(). The rules this file owns are the ones that
 * decide whether a number is true:
 *
 *  - STEPS ARE NOT SUMMED ACROSS SOURCES. A phone in a pocket and a
 *    watch on a wrist both count the same walk; adding them reports a
 *    person walking twice. Where the adapter can use HealthKit's own
 *    statistics API the store de-duplicates; when raw samples arrive
 *    here anyway, the day is credited to the single source that saw the
 *    most of it. Slightly under is honest; double is not.
 *
 *  - SLEEP INTERVALS MERGE. A watch and a phone both describe the same
 *    night, overlapping. The night's total is the union of asleep
 *    intervals — never the sum, and never in-bed or awake time. Stages
 *    are deliberately not scored; which stage a sleeping brain was in
 *    is a claim this app has no business grading.
 *
 *  - WORKOUTS DEDUPLICATE BY UUID, the stable identity HealthKit
 *    assigns, not by looks — two 30-minute walks in one day are two
 *    real walks.
 *
 *  - A NIGHT BELONGS TO ITS MORNING. Sleep from 22:40 to 6:10 is filed
 *    under the date the sleeper woke on, because the question it will
 *    ever be asked is "how was the night before this morning's pain".
 *    The attribution window is 18:00 the previous evening to noon —
 *    naps after noon are not the night.
 *
 *  - MISSING STAYS MISSING. No field is ever defaulted to zero. A day
 *    with no step samples has no `steps`, and the coverage map is how a
 *    reader distinguishes "not measured" from "measured nothing".
 */
import {
  DayRawBundle, HealthDay, LocalClock, NormalizedWorkout, QuantitySample,
  SleepSample,
} from './types';

/** the night window: asleep intervals touching [D-1 18:00, D 12:00) */
const NIGHT_FROM_PREV_MIN = 18 * 60;
const NIGHT_UNTIL_MIN = 12 * 60;

/** merge intervals into their union, in minutes */
export function mergedMinutes(iv: { start: number; end: number }[]): number {
  if (!iv.length) return 0;
  const s = iv.slice().sort((a, b) => a.start - b.start);
  let total = 0, curS = s[0].start, curE = s[0].end;
  for (let i = 1; i < s.length; i++) {
    if (s[i].start <= curE) {
      if (s[i].end > curE) curE = s[i].end;
    } else {
      total += curE - curS;
      curS = s[i].start; curE = s[i].end;
    }
  }
  total += curE - curS;
  return Math.round(total / 60000);
}

/** the asleep union for the night ending on `date`'s morning */
export function nightSleep(
  samples: SleepSample[], date: string, clock: LocalClock
): { minutes: number; start: number; end: number } | null {
  const dayStart = clock.startOf(date);
  /* the window in instants: yesterday 18:00 local to today noon local.
     Built from local midnights rather than fixed 24h offsets, so a
     daylight-saving night is 23 or 25 hours long and still correct. */
  const winFrom = dayStart - (24 * 60 - NIGHT_FROM_PREV_MIN) * 60000;
  const winTo = dayStart + NIGHT_UNTIL_MIN * 60000;
  const asleep = samples.filter((s) =>
    s.stage === 'asleep' && s.end > winFrom && s.start < winTo);
  if (!asleep.length) return null;
  const clipped = asleep.map((s) => ({
    start: Math.max(s.start, winFrom),
    end: Math.min(s.end, winTo),
  }));
  return {
    minutes: mergedMinutes(clipped),
    start: Math.min.apply(null, clipped.map((s) => s.start)),
    end: Math.max.apply(null, clipped.map((s) => s.end)),
  };
}

/** Sum a quantity for the day WITHOUT crossing sources: each source's
 *  own total is computed and the largest single source wins. */
export function bestSourceTotal(samples: QuantitySample[]): number | null {
  if (!samples.length) return null;
  const by: Record<string, number> = {};
  samples.forEach((s) => { by[s.source] = (by[s.source] || 0) + s.value; });
  let best = 0;
  Object.keys(by).forEach((k) => { if (by[k] > best) best = by[k]; });
  return best;
}

/** the winning source's samples, for anything that needs the day's
 *  intra-day shape from one consistent instrument */
function bestSourceSamples(samples: QuantitySample[]): QuantitySample[] {
  if (!samples.length) return [];
  const by: Record<string, number> = {};
  samples.forEach((s) => { by[s.source] = (by[s.source] || 0) + s.value; });
  let bestK = samples[0].source;
  Object.keys(by).forEach((k) => { if (by[k] > by[bestK]) bestK = k; });
  return samples.filter((s) => s.source === bestK);
}

/** steps per local hour from the winning source. A sample is credited to
 *  the hour it started in — hourly resolution is all "since the last
 *  check-in" needs, and pretending finer would be precision the data
 *  does not have. */
export function hourlySteps(samples: QuantitySample[], clock: LocalClock): number[] {
  const out = Array(24).fill(0) as number[];
  bestSourceSamples(samples).forEach((s) => {
    const h = Math.floor(clock.minutesOf(s.start) / 60);
    if (h >= 0 && h < 24) out[h] += s.value;
  });
  return out.map((v) => Math.round(v));
}

/** workouts deduplicated by uuid and filed at their local start time */
export function normalizeWorkouts(
  raw: DayRawBundle['workouts'], clock: LocalClock
): NormalizedWorkout[] {
  const seen: Record<string, true> = {};
  const out: NormalizedWorkout[] = [];
  raw.forEach((w) => {
    if (seen[w.uuid]) return;
    seen[w.uuid] = true;
    out.push({
      uuid: w.uuid,
      h: clock.minutesOf(w.start),
      minutes: Math.max(1, Math.round((w.end - w.start) / 60000)),
      activity: w.activity,
      energy: w.energy,
    });
  });
  return out.sort((a, b) => a.h - b.h);
}

/** the sparse dailies: resting HR and HRV arrive as one-or-few samples
 *  and are kept as a plain daily value — context, never a score */
function sparseDaily(samples: QuantitySample[]): number | null {
  if (!samples.length) return null;
  const sum = samples.reduce((s, x) => s + x.value, 0);
  return Math.round((sum / samples.length) * 10) / 10;
}

/** one raw bundle → one normalized day. Fields appear only where data
 *  did; the coverage map records which categories produced anything. */
export function normalizeDay(raw: DayRawBundle, clock: LocalClock): HealthDay {
  const day: HealthDay = { date: raw.date, coverage: {} };

  const night = nightSleep(raw.sleep, raw.date, clock);
  if (night) {
    day.sleepMinutes = night.minutes;
    day.sleepStart = night.start;
    day.sleepEnd = night.end;
    day.coverage.sleep = true;
  }

  const steps = bestSourceTotal(raw.steps);
  if (steps != null) {
    day.steps = Math.round(steps);
    day.stepsHourly = hourlySteps(raw.steps, clock);
    day.coverage.movement = true;
  }
  const dist = bestSourceTotal(raw.distance);
  if (dist != null) { day.distanceMeters = Math.round(dist); day.coverage.movement = true; }
  const energy = bestSourceTotal(raw.activeEnergy);
  if (energy != null) { day.activeEnergyKcal = Math.round(energy); day.coverage.movement = true; }

  /* an empty workout list under granted permission is a real "no
     workouts today" ONLY if movement data shows the day was measured at
     all — on its own, no workouts is silence, and silence is not a
     value. Coverage for workouts therefore requires movement coverage. */
  const workouts = normalizeWorkouts(raw.workouts, clock);
  if (workouts.length) {
    day.workouts = workouts;
    day.coverage.workouts = true;
  } else if (day.coverage.movement) {
    day.workouts = [];
    day.coverage.workouts = true;
  }

  const rhr = sparseDaily(raw.restingHeartRate);
  if (rhr != null) { day.restingHeartRate = rhr; day.coverage.heart = true; }
  const hrv = sparseDaily(raw.hrvSDNN);
  if (hrv != null) { day.hrvSDNN = hrv; day.coverage.heart = true; }

  if (raw.stateOfMind.length) {
    day.stateOfMind = raw.stateOfMind
      .map((s) => ({ h: clock.minutesOf(s.ts), valence: s.valence, kind: s.kind }))
      .sort((a, b) => a.h - b.h);
    day.coverage.mind = true;
  }

  return day;
}
