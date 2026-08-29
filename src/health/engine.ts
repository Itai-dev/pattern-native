/**
 * The possible-pattern engine for health context. Deterministic, pure,
 * and deliberately incapable of saying most of the things people want
 * it to say.
 *
 * WHAT IT COMPARES. For each supported association, the person's paired
 * days are split at their OWN distribution: the outer terciles of the
 * factor, middle third discarded — the same construction the report's
 * harder/easier days use, for the same reason. There is no universal
 * "enough sleep" or "too many steps"; there is only more and less than
 * is usual for this one person.
 *
 * WHAT IT TAKES TO SPEAK. All of these, together, before anything is
 * worth a sentence — each named and argued in thresholds.ts:
 *   HEALTH_MIN_PAIRED_DAYS distinct paired days,
 *   HEALTH_MIN_GROUP_DAYS in each tercile group,
 *   the factor itself meaningfully different between the groups,
 *   HEALTH_MIN_DELTA points of mean pain between them.
 * Fail the first two and the verdict is `insufficient`. Pass them but
 * fail the last two and it is `observation` — the record is described,
 * no association is claimed.
 *
 * WHAT IT CAN NEVER RETURN. A cause, a trigger, a diagnosis, a
 * prediction, or anything about medication. The verdict type has four
 * values and none of them is any of those; copy is generated elsewhere
 * from the numbers here, and every user-facing sentence carries its
 * sample sizes and its non-causation line.
 *
 * `fading` exists because an association that stops holding must not
 * silently vanish — the caller passes what was previously shown, and if
 * a shown association no longer clears the gates the engine says so
 * out loud instead of pretending it never spoke.
 *
 * ONLY THE LISTED ASSOCIATIONS ARE EVER TESTED, and only when the
 * user's connected Health categories license them. Resting HR, HRV and State of
 * Mind are imported and normalized but generate nothing here — a
 * correlation engine pointed at every stream it can reach is a machine
 * for finding accidents.
 */
import {
  HEALTH_MIN_DELTA, HEALTH_MIN_GROUP_DAYS, HEALTH_MIN_PAIRED_DAYS,
  HEALTH_SLEEP_MIN_SPREAD_MINUTES, HEALTH_STEPS_MIN_SPREAD,
  HEALTH_STAND_MIN_SPREAD_MINUTES, HEALTH_WORKOUT_MIN_SPREAD_MINUTES,
} from '../thresholds';
import { PairKind, PairedDay } from './windows';

export type Verdict = 'insufficient' | 'observation' | 'possible' | 'fading';

export interface Association {
  kind: PairKind;
  verdict: Verdict;
  /** paired days seen at all */
  pairedDays: number;
  /** the two groups, present from `observation` up */
  low?: { n: number; factorMean: number; painMean: number };
  high?: { n: number; factorMean: number; painMean: number };
  /** high-group pain minus low-group pain, rounded to 0.1 */
  delta?: number;
  /** first and last paired date, for the detail view */
  from?: string;
  to?: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** the factor-spread floor for each association — below it the "high"
 *  and "low" groups are the same behaviour sorted into piles */
function spreadFloor(kind: PairKind): number {
  if (kind === 'sleepVsMorning') return HEALTH_SLEEP_MIN_SPREAD_MINUTES;
  if (kind === 'workoutVsNextMorning') return 1;   // the groups are categorical
  if (kind === 'workoutLoadVsNextMorning') return HEALTH_WORKOUT_MIN_SPREAD_MINUTES;
  if (kind === 'standBeforeVsEvening') return HEALTH_STAND_MIN_SPREAD_MINUTES;
  return HEALTH_STEPS_MIN_SPREAD;
}

/**
 * Evaluate one association from its lawful pairs.
 *
 * @param previouslyShown  was this association last presented to the
 *   user as `possible`? Feeds the fading rule and nothing else.
 */
export function evaluate(
  kind: PairKind, pairs: PairedDay[], previouslyShown = false
): Association {
  const base: Association = { kind, verdict: 'insufficient', pairedDays: pairs.length };
  const fade = (a: Association): Association =>
    previouslyShown && a.verdict !== 'possible' ? { ...a, verdict: 'fading' } : a;

  if (pairs.length < HEALTH_MIN_PAIRED_DAYS) return fade(base);

  const sorted = pairs.slice().sort((a, b) => a.factor - b.factor);

  let lowG: PairedDay[], highG: PairedDay[];
  if (kind === 'workoutVsNextMorning') {
    /* categorical: covered days without a workout vs days with one */
    lowG = sorted.filter((p) => p.factor === 0);
    highG = sorted.filter((p) => p.factor > 0);
  } else {
    /* outer terciles of the person's own values, middle third discarded */
    const third = Math.floor(sorted.length / 3);
    lowG = sorted.slice(0, third);
    highG = sorted.slice(sorted.length - third);
  }

  if (lowG.length < HEALTH_MIN_GROUP_DAYS || highG.length < HEALTH_MIN_GROUP_DAYS) {
    return fade(base);
  }

  const low = {
    n: lowG.length,
    factorMean: round1(mean(lowG.map((p) => p.factor))),
    painMean: round1(mean(lowG.map((p) => p.pain))),
  };
  const high = {
    n: highG.length,
    factorMean: round1(mean(highG.map((p) => p.factor))),
    painMean: round1(mean(highG.map((p) => p.pain))),
  };
  const delta = round1(high.painMean - low.painMean);
  const dates = pairs.map((p) => p.date).sort();
  const full: Association = {
    kind, pairedDays: pairs.length, low, high, delta,
    from: dates[0], to: dates[dates.length - 1],
    verdict: 'observation',
  };

  /* the factor must genuinely vary between the groups */
  if (high.factorMean - low.factorMean < spreadFloor(kind)) return fade(full);
  /* and the pain difference must clear the same bar every comparison
     in this app clears */
  if (Math.abs(delta) < HEALTH_MIN_DELTA) return fade(full);

  return { ...full, verdict: 'possible' };
}

/* ── copy, from numbers ──────────────────────────────────────
   Fixed sentence shapes with the numbers inserted — deterministic for
   the same reason the day summary is: these words sit in a health
   record. Direction words are computed, never guessed, and every
   sentence that claims anything carries its group sizes. The
   non-causation line is part of the card, not an optional footnote. */

export const HEALTH_NON_CAUSATION =
  'This is an association in what you recorded, not proof of what caused what.';

/* `join` is the honest preposition: "after" for factors from the
   previous night or day, "on" for the same day's earlier hours. The
   timing sentence names the direction of time explicitly, because it is
   the one thing a reader will not check and the one thing that makes
   the comparison lawful. */
const KIND_WORDS: Record<PairKind, {
  factor: string; timing: string; join: 'after' | 'on';
  lowWord: string; highWord: string; groupNoun: string;
}> = {
  sleepVsMorning: {
    factor: 'Sleep', timing: 'Each morning is compared with the night before it.',
    join: 'after', lowWord: 'shorter-sleep', highWord: 'longer-sleep', groupNoun: 'nights',
  },
  prevDayStepsVsMorning: {
    factor: 'The previous day’s movement',
    timing: 'Each morning is compared with the day before it, never with the same day.',
    join: 'after', lowWord: 'quieter', highWord: 'more active', groupNoun: 'days',
  },
  stepsBeforeVsEvening: {
    factor: 'Movement through the day',
    timing: 'Each evening is compared only with the hours before that check-in.',
    join: 'on', lowWord: 'quieter', highWord: 'more active', groupNoun: 'days',
  },
  workoutVsNextMorning: {
    factor: 'A workout',
    timing: 'Each morning is compared with the day before it, never with the same day.',
    join: 'after', lowWord: 'no-workout', highWord: 'workout', groupNoun: 'days',
  },
  standBeforeVsEvening: {
    factor: 'Time upright',
    timing: 'Each evening is compared only with the hours before that check-in. '
      + 'Upright time comes from an Apple Watch — it measures standing, not sitting, '
      + 'and an unworn watch is a missing day, never a still one.',
    join: 'on', lowWord: 'less-upright', highWord: 'more-upright', groupNoun: 'days',
  },
  workoutLoadVsNextMorning: {
    factor: 'Workout load',
    timing: 'Each morning is compared with the previous day’s workouts. Load is total '
      + 'workout time, split at your own usual — not a universal bar.',
    join: 'after', lowWord: 'lighter-workout', highWord: 'harder-workout', groupNoun: 'days',
  },
};

/** the group vocabulary for a kind, for surfaces that draw the groups
 *  themselves — the same words the sentences use, never a second set */
export function groupLabels(kind: PairKind): {
  factor: string; low: string; high: string; noun: string; outcome: string; timing: string;
} {
  const w = KIND_WORDS[kind];
  return {
    factor: w.factor, low: w.lowWord, high: w.highWord, noun: w.groupNoun,
    outcome: EVENING_KINDS.indexOf(kind) >= 0 ? 'evening pain' : 'morning pain',
    timing: w.timing,
  };
}

/** the factor value as a human reads it, per kind — "7h 40m", "4,810
 *  steps", "48 min". One formatter, shared by every surface that shows
 *  a group mean, so no two screens spell the same quantity differently. */
export function factorLabel(kind: PairKind, value: number): string {
  if (kind === 'sleepVsMorning' || kind === 'standBeforeVsEvening') {
    const h = Math.floor(value / 60), m = Math.round(value % 60);
    if (h === 0) return m + ' min';
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }
  if (kind === 'workoutLoadVsNextMorning') return Math.round(value) + ' min';
  if (kind === 'workoutVsNextMorning') return value > 0 ? 'workout' : 'no workout';
  return Math.round(value).toLocaleString('en-US') + ' steps';
}

/** the kinds whose outcome is the evening check-in — every other kind reads the morning */
const EVENING_KINDS: PairKind[] = ['stepsBeforeVsEvening', 'standBeforeVsEvening'];

export interface AssociationCopy {
  title: string;
  body: string;
  sample: string;
  /** the direction of time, spelled out */
  timing: string;
  disclaimer: string;
}

/** the card's words for a `possible` association. Callers must not call
 *  this for any other verdict — there is deliberately nothing to say. */
export function associationCopy(a: Association): AssociationCopy | null {
  if (a.verdict !== 'possible' || !a.low || !a.high || a.delta == null) return null;
  const w = KIND_WORDS[a.kind];
  const size = Math.abs(a.delta);
  const dir = a.delta < 0 ? 'lower' : 'higher';
  /* which pain this is about, named — morning and evening are different
     outcomes and must not blur */
  const outcome = EVENING_KINDS.indexOf(a.kind) >= 0 ? 'evening pain' : 'morning pain';
  return {
    title: w.factor + ' may be worth watching',
    body: 'Your ' + outcome + ' averaged ' + size + (size === 1 ? ' point ' : ' points ')
      + dir + ' ' + w.join + ' your ' + w.highWord + ' ' + w.groupNoun
      + ' than ' + w.join + ' your ' + w.lowWord + ' ones.',
    sample: 'Based on ' + a.high.n + ' ' + w.highWord + ' and ' + a.low.n + ' '
      + w.lowWord + ' ' + w.groupNoun + '.',
    timing: w.timing,
    disclaimer: HEALTH_NON_CAUSATION,
  };
}

/** the quiet line for an association the user's focus asks about but
 *  the record cannot yet support */
export function stillLearningCopy(factorName: string): string {
  return 'Pattern is still learning about ' + factorName.toLowerCase()
    + ' from the days you choose to record.';
}

/** the line for a previously shown association that stopped holding */
export function fadedCopy(a: Association): string {
  const w = KIND_WORDS[a.kind];
  return 'The earlier association with ' + w.factor.toLowerCase()
    + ' hasn’t stayed consistent as more days arrived. That happens, and it'
    + ' is worth knowing — it is why Pattern waits before saying anything.';
}
