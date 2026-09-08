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
 * user's connected Health categories license them. Resting HR and HRV
 * are imported and normalized but generate nothing here — a
 * correlation engine pointed at every stream it can reach is a machine
 * for finding accidents. State of Mind earned one comparison
 * (mindVsEvening, 8 Sep 2026): the moods logged earlier in the day
 * beside the evening's pain, worded as two things that move together
 * and never as one causing the other.
 */
import {
  EARLY_MIN_GROUP_DAYS, EARLY_MIN_PAIRED_DAYS,
  HEALTH_MIN_DELTA, HEALTH_MIN_GROUP_DAYS, HEALTH_MIN_PAIRED_DAYS,
  HEALTH_CAFFEINE_MIN_SPREAD_MG, HEALTH_MIND_MIN_SPREAD, HEALTH_SLEEP_MIN_SPREAD_MINUTES,
  HEALTH_STEPS_MIN_SPREAD, HEALTH_WATER_MIN_SPREAD_ML,
  HEALTH_STAND_MIN_SPREAD_MINUTES, HEALTH_WORKOUT_MIN_SPREAD_MINUTES,
} from '../thresholds';
import { PairKind, PairedDay } from './windows';
import { valenceWord } from './context';

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
  /** for sleep: what the nights were measured by. 'inBed' means the
   *  store never had an asleep record and the card must say so. */
  basis?: 'asleep' | 'inBed';
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** the comparisons whose factor is yes-or-no: covered days without the
 *  thing against days with it, rather than the person's terciles */
export function isCategorical(kind: PairKind): boolean {
  return kind === 'workoutVsNextMorning' || kind === 'alcoholVsNextMorning';
}

/** the factor-spread floor for each association — below it the "high"
 *  and "low" groups are the same behaviour sorted into piles */
function spreadFloor(kind: PairKind): number {
  if (kind === 'sleepVsMorning') return HEALTH_SLEEP_MIN_SPREAD_MINUTES;
  if (isCategorical(kind)) return 1;   // the groups are categorical
  if (kind === 'waterBeforeVsEvening') return HEALTH_WATER_MIN_SPREAD_ML;
  if (kind === 'caffeineBeforeVsEvening') return HEALTH_CAFFEINE_MIN_SPREAD_MG;
  if (kind === 'workoutLoadVsNextMorning') return HEALTH_WORKOUT_MIN_SPREAD_MINUTES;
  if (kind === 'standBeforeVsEvening') return HEALTH_STAND_MIN_SPREAD_MINUTES;
  if (kind === 'mindVsEvening') return HEALTH_MIND_MIN_SPREAD;
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
  if (pairs.length && pairs[0].basis) base.basis = pairs[0].basis;
  const fade = (a: Association): Association =>
    previouslyShown && a.verdict !== 'possible' ? { ...a, verdict: 'fading' } : a;

  if (pairs.length < HEALTH_MIN_PAIRED_DAYS) return fade(base);

  const sorted = pairs.slice().sort((a, b) => a.factor - b.factor);

  let lowG: PairedDay[], highG: PairedDay[];
  if (isCategorical(kind)) {
    /* categorical: covered days without the thing vs days with it */
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
    ...(base.basis ? { basis: base.basis } : {}),
  };

  /* the factor must genuinely vary between the groups */
  if (high.factorMean - low.factorMean < spreadFloor(kind)) return fade(full);
  /* and the pain difference must clear the same bar every comparison
     in this app clears */
  if (Math.abs(delta) < HEALTH_MIN_DELTA) return fade(full);

  return { ...full, verdict: 'possible' };
}

/* ── the early look ─────────────────────────────────────────
   The same comparison before it has earned a sentence: the person's
   lower half of days against their upper half (halves, not terciles —
   with five days a tercile is one day), each at least
   EARLY_MIN_GROUP_DAYS, drawn as the same two bars and captioned as a
   picture. No verdict, no delta gate, no spread gate: it is not a
   claim, and the words beside it say so. */

export interface EarlyLook {
  kind: PairKind;
  pairedDays: number;
  low: { n: number; factorMean: number; painMean: number };
  high: { n: number; factorMean: number; painMean: number };
  /** high minus low, for the bars' order only — never a sentence */
  delta: number;
}

export function earlyLook(kind: PairKind, pairs: PairedDay[]): EarlyLook | null {
  if (pairs.length < EARLY_MIN_PAIRED_DAYS || pairs.length >= HEALTH_MIN_PAIRED_DAYS) return null;
  const sorted = pairs.slice().sort((a, b) => a.factor - b.factor);
  let lowG: PairedDay[], highG: PairedDay[];
  if (isCategorical(kind)) {
    lowG = sorted.filter((p) => p.factor === 0);
    highG = sorted.filter((p) => p.factor > 0);
  } else {
    const half = Math.floor(sorted.length / 2);
    lowG = sorted.slice(0, half);
    highG = sorted.slice(sorted.length - half);
  }
  if (lowG.length < EARLY_MIN_GROUP_DAYS || highG.length < EARLY_MIN_GROUP_DAYS) return null;
  const g = (a: PairedDay[]) => ({
    n: a.length,
    factorMean: round1(mean(a.map((p) => p.factor))),
    painMean: round1(mean(a.map((p) => p.pain))),
  });
  const low = g(lowG), high = g(highG);
  return { kind, pairedDays: pairs.length, low, high, delta: round1(high.painMean - low.painMean) };
}

/** the caption every early look carries — the picture's disclaimer,
 *  fixed words, beside the bars */
export const EARLY_NOTE =
  'An early look: too few days to call anything. It fills in as you check in.';

/** the caption under the first days — a list of facts, not yet a picture */
export const FIRST_NOTE =
  'The days so far, as recorded. A picture starts at ' + EARLY_MIN_PAIRED_DAYS
  + ' paired days, a comparison at ' + HEALTH_MIN_PAIRED_DAYS + '.';

/** the first-days block's title: the factor and the pain it sits beside */
export function firstTitle(kind: PairKind): string {
  const w = KIND_WORDS[kind];
  const outcome = EVENING_KINDS.indexOf(kind) >= 0 ? 'evening pain' : 'morning pain';
  return w.factor + ' beside ' + outcome + ', the first days';
}

/** the early look's title and its count — never a direction word */
export function earlyCopy(e: EarlyLook): { title: string; evidence: string } {
  const w = KIND_WORDS[e.kind];
  const outcome = EVENING_KINDS.indexOf(e.kind) >= 0 ? 'evening pain' : 'morning pain';
  return {
    title: w.factor + ' and ' + outcome + ', so far',
    evidence: e.pairedDays + ' of ' + HEALTH_MIN_PAIRED_DAYS + ' paired days.',
  };
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
  /** what one paired day takes — the instruction a person can act on
   *  while the comparison is still collecting */
  needs: string;
}> = {
  sleepVsMorning: {
    factor: 'Sleep', timing: 'Each morning is compared with the night before it.',
    join: 'after', lowWord: 'shorter-sleep', highWord: 'longer-sleep', groupNoun: 'nights',
    needs: 'a check-in before noon, on a morning Health has a night for',
  },
  prevDayStepsVsMorning: {
    factor: 'The previous day’s movement',
    timing: 'Each morning is compared with the day before it, never with the same day.',
    join: 'after', lowWord: 'quieter', highWord: 'more active', groupNoun: 'days',
    needs: 'a check-in before noon, the day after Health counted steps',
  },
  stepsBeforeVsEvening: {
    factor: 'Movement through the day',
    timing: 'Each evening is compared only with the hours before that check-in.',
    join: 'on', lowWord: 'quieter', highWord: 'more active', groupNoun: 'days',
    needs: 'a check-in in the evening, from five, on a day Health counted steps',
  },
  workoutVsNextMorning: {
    factor: 'A workout',
    timing: 'Each morning is compared with the day before it, never with the same day.',
    join: 'after', lowWord: 'no-workout', highWord: 'workout', groupNoun: 'days',
    needs: 'a check-in before noon, the day after Health saw movement',
  },
  standBeforeVsEvening: {
    factor: 'Time upright',
    timing: 'Each evening is compared only with the hours before that check-in. '
      + 'Upright time comes from an Apple Watch — it measures standing, not sitting, '
      + 'and an unworn watch is a missing day, never a still one.',
    join: 'on', lowWord: 'less-upright', highWord: 'more-upright', groupNoun: 'days',
    needs: 'an evening check-in on a day the watch was worn',
  },
  mindVsEvening: {
    factor: 'Mood',
    /* the one timing sentence on this screen that must argue AGAINST
       itself: the arrow of time is honest here and still says nothing
       about cause, because a hard day sours a mood as readily as a
       mood hardens a day. "Accompanies", in metrics.ts's vocabulary. */
    timing: 'Each evening is compared only with the moods you logged in Health earlier '
      + 'that day. Mood and pain move together; this says nothing about which leads — '
      + 'a hard day can sour a mood as easily as the other way round.',
    join: 'on', lowWord: 'more unpleasant', highWord: 'more pleasant', groupNoun: 'days',
    needs: 'a State of Mind entry in Health, then a check-in in the evening',
  },
  waterBeforeVsEvening: {
    factor: 'Water',
    timing: 'Each evening is compared only with the water logged in Health before that check-in.',
    join: 'on', lowWord: 'less-water', highWord: 'more-water', groupNoun: 'days',
    needs: 'water logged in Health, then a check-in in the evening',
  },
  caffeineBeforeVsEvening: {
    factor: 'Caffeine',
    timing: 'Each evening is compared only with the caffeine logged in Health before that check-in.',
    join: 'on', lowWord: 'less-caffeine', highWord: 'more-caffeine', groupNoun: 'days',
    needs: 'caffeine logged in Health, then a check-in in the evening',
  },
  alcoholVsNextMorning: {
    factor: 'Drinks',
    timing: 'Each morning is compared with the day before it, never with the same day. '
      + 'A day counts as no-drinks only when something else was logged in Health that day — '
      + 'nobody logs a zero.',
    join: 'after', lowWord: 'no-drinks', highWord: 'drinks', groupNoun: 'days',
    needs: 'a check-in before noon, the day after Health had a water or caffeine entry',
  },
  workoutLoadVsNextMorning: {
    factor: 'Workout load',
    timing: 'Each morning is compared with the previous day’s workouts. Load is total '
      + 'workout time, split at your own usual — not a universal bar.',
    join: 'after', lowWord: 'lighter-workout', highWord: 'harder-workout', groupNoun: 'days',
    needs: 'a check-in before noon, the day after a workout',
  },
};

/** the "still collecting" sentence for a health comparison that has not
 *  reached its gate: how many paired days, how many it takes, and what
 *  one more takes — an instruction, never a number about pain */
export function progressCopy(p: { kind: PairKind; pairedDays: number; needed: number }): {
  title: string; evidence: string; caveat: string;
} {
  const w = KIND_WORDS[p.kind];
  const outcome = EVENING_KINDS.indexOf(p.kind) >= 0 ? 'evening pain' : 'morning pain';
  return {
    title: w.factor + ' and ' + outcome,
    evidence: p.pairedDays + ' of ' + p.needed + ' paired '
      + (p.pairedDays === 1 && p.needed === 1 ? 'day' : 'days') + ' so far.',
    caveat: 'Each one takes ' + w.needs + '.',
  };
}

/** the one line a sleep card adds when the nights were measured in bed
 *  rather than asleep */
export const IN_BED_NOTE =
  'Sleep here is time in bed, from a sleep schedule — Health had no record of time asleep.';

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
  if (kind === 'alcoholVsNextMorning') return value > 0 ? 'drinks' : 'no drinks';
  if (kind === 'mindVsEvening') return valenceWord(value).toLowerCase();
  if (kind === 'waterBeforeVsEvening') {
    return value >= 1000 ? (Math.round(value / 100) / 10) + ' L' : Math.round(value) + ' ml';
  }
  if (kind === 'caffeineBeforeVsEvening') return Math.round(value) + ' mg';
  return Math.round(value).toLocaleString('en-US') + ' steps';
}

/** the kinds whose outcome is the evening check-in — every other kind reads the morning */
const EVENING_KINDS: PairKind[] = [
  'stepsBeforeVsEvening', 'standBeforeVsEvening', 'mindVsEvening',
  'waterBeforeVsEvening', 'caffeineBeforeVsEvening',
];

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
