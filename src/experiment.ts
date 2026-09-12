/**
 * The experiment — one thing you try for two weeks, and what the
 * mornings after said.
 *
 * WHY THIS EXISTS. A record read back is homework; a question with a
 * countdown and an answer at the end is a reason to check in. The
 * person names the thing in their own words ("walk on days I would
 * skip", "an early night"), the evening check-in asks whether it
 * happened, and the next morning's number is the outcome. At the end
 * the record says which of three true things it found: the mornings
 * differed, they did not, or there were not enough days each way to
 * tell. All three are answers. "No difference" is the one most
 * trackers hide, and it is the one that lets a person stop worrying
 * about something.
 *
 * WHAT IT REWARDS. Finding out — never logging for its own sake. A day
 * without an answer is a day without a pair, and that is the whole
 * consequence: no streak, no guilt, no counter that resets. The
 * countdown is to an answer, not to a score.
 *
 * WHAT IT IS NOT. Advice, a plan, or a cause. The person chose the
 * days, so the comparison is theirs to read: an early night on the
 * nights they felt fine is a different experiment from the one they
 * meant, and the non-causation line sits on every result for that
 * reason. Nothing here tells anyone to keep doing or stop doing
 * anything — it says what the mornings looked like, and they decide.
 *
 * THE ARITHMETIC IS THE ENGINE'S. Yes-days against no-days, the same
 * group floor and the same delta the Health comparisons clear
 * (thresholds.ts argues both). It is not routed through engine.evaluate
 * because that gate asks for fourteen PAIRED days before it will look,
 * which a fourteen-day experiment cannot reach; the experiment's own
 * gate is the group floor each way, and it extends itself to reach it
 * (up to EXPERIMENT_MAX_DAYS) rather than answer early.
 *
 * Pure: no React Native, no storage — db.ts holds the experiment,
 * this file reads it against the record, and the screens render what
 * comes back.
 */
import { Entries, Experiment, addDays, answerOf, logsOf } from './model';
import { HEALTH_NON_CAUSATION } from './health/engine';
import { morningPain } from './health/windows';
import {
  EXPERIMENT_DAYS, EXPERIMENT_MAX_DAYS, EXPERIMENT_MIN_GROUP_DAYS, HEALTH_MIN_DELTA,
} from './thresholds';

/** the day-scoped question's id — the evening answer is stored under
 *  it like any other day answer, three-state and revisable */
export const EXPERIMENT_METRIC_ID = 'experiment.did.v1';

/* the type, its cap and its cleaner live in model.ts with the other
   domain shapes, so the backup validator can use them without a
   cycle; they are re-exported here for the screens and the tests */
export { cleanExperiment, EXPERIMENT_WHAT_MAX } from './model';
export type { Experiment } from './model';

/** offered as chips; a person can type their own */
export const EXPERIMENT_EXAMPLES = [
  'walk on days I would skip',
  'an early night',
  'no coffee after noon',
  'ten minutes of stretching',
];

export type ExperimentVerdict = 'running' | 'possible' | 'observation' | 'insufficient';

export interface ExperimentPair {
  /** the date of the evening answer */
  date: string;
  did: boolean;
  /** the next morning's first check-in */
  pain: number;
}

export interface ExperimentState {
  exp: Experiment;
  /** 1-based day of the experiment for `todayIso` */
  day: number;
  /** the planned length — the countdown's denominator */
  planned: number;
  /** days with a yes and a morning after, and days with a no */
  yes: number;
  no: number;
  /** every day with an evening answer, morning or not — what the
   *  person actually did, before the outcome joins it */
  answered: number;
  pairs: ExperimentPair[];
  /** past the planned length and still collecting: the gate has not
   *  been reached and the maximum has not either */
  extended: boolean;
  /** true once the experiment has ended, by reaching its gate after
   *  the planned days or by hitting the maximum */
  ended: boolean;
  verdict: ExperimentVerdict;
  yesMean?: number;
  noMean?: number;
  /** yes minus no, rounded to 0.1 */
  delta?: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** how many days from the start `date` is, 1-based; 0 before the start */
function dayOf(from: string, date: string): number {
  if (date < from) return 0;
  let d = from, n = 1;
  while (d < date && n <= EXPERIMENT_MAX_DAYS + 1) { d = addDays(d, 1); n++; }
  return n;
}

/**
 * The pairs an experiment has earned from the record: each day from the
 * start with a real yes-or-no (a skipped question is not a no) and a
 * check-in before noon the NEXT day. The morning is the outcome the
 * sleep and workout comparisons already use, for the same reason: it
 * is the first number after the thing, and the day it belongs to has
 * not yet happened.
 */
export function experimentPairs(exp: Experiment, entries: Entries, uptoIso: string): ExperimentPair[] {
  const out: ExperimentPair[] = [];
  const last = exp.endedOn && exp.endedOn < uptoIso ? exp.endedOn : uptoIso;
  for (let d = exp.from, i = 0; d <= last && i < EXPERIMENT_MAX_DAYS; d = addDays(d, 1), i++) {
    const a = answerOf(entries[d], EXPERIMENT_METRIC_ID);
    if (!a || a.skipped || (a.value !== 'yes' && a.value !== 'no')) continue;
    const next = morningPain(logsOf(entries[addDays(d, 1)]));
    if (!next) continue;
    out.push({ date: d, did: a.value === 'yes', pain: next.pain });
  }
  return out;
}

/** days with a yes-or-no answer at all, whether or not a morning followed */
function answeredDays(exp: Experiment, entries: Entries, uptoIso: string): number {
  let n = 0;
  const last = exp.endedOn && exp.endedOn < uptoIso ? exp.endedOn : uptoIso;
  for (let d = exp.from, i = 0; d <= last && i < EXPERIMENT_MAX_DAYS; d = addDays(d, 1), i++) {
    const a = answerOf(entries[d], EXPERIMENT_METRIC_ID);
    if (a && !a.skipped && (a.value === 'yes' || a.value === 'no')) n++;
  }
  return n;
}

/**
 * Where an experiment stands on `todayIso`. Deterministic: the same
 * record and the same date give the same state, and nothing here
 * changes between two opens of the same day except what the person
 * added.
 *
 * ENDING. After the planned days, the experiment ends the first day
 * both groups reach the floor; otherwise it keeps collecting, saying
 * so, and ends at the maximum with whatever it has. A stopped or done
 * experiment is read as of its last day, not today's.
 */
export function experimentState(exp: Experiment, entries: Entries, todayIso: string): ExperimentState {
  const asOf = exp.status === 'running' ? todayIso : (exp.endedOn || todayIso);
  const pairs = experimentPairs(exp, entries, asOf);
  const yesP = pairs.filter((p) => p.did).map((p) => p.pain);
  const noP = pairs.filter((p) => !p.did).map((p) => p.pain);
  const day = Math.min(dayOf(exp.from, asOf), EXPERIMENT_MAX_DAYS);
  const gate = yesP.length >= EXPERIMENT_MIN_GROUP_DAYS && noP.length >= EXPERIMENT_MIN_GROUP_DAYS;
  /* the pairs the planned window can hold: the last evening's morning
     is the day after the window, so the window itself must be over */
  const pastPlanned = day > EXPERIMENT_DAYS;
  const atMax = day >= EXPERIMENT_MAX_DAYS;
  const ended = exp.status !== 'running' || atMax || (pastPlanned && gate);

  const base: ExperimentState = {
    exp, day: Math.max(1, day), planned: EXPERIMENT_DAYS,
    yes: yesP.length, no: noP.length,
    answered: answeredDays(exp, entries, asOf),
    pairs, extended: !ended && pastPlanned, ended, verdict: 'running',
  };
  if (!ended) return base;
  if (!gate) return { ...base, verdict: 'insufficient' };
  const yesMean = round1(mean(yesP)), noMean = round1(mean(noP));
  const delta = round1(yesMean - noMean);
  return {
    ...base, yesMean, noMean, delta,
    verdict: Math.abs(delta) >= HEALTH_MIN_DELTA ? 'possible' : 'observation',
  };
}

/* ── copy ─────────────────────────────────────────────────────
   Fixed shapes with the numbers inserted, deterministic, because the
   sentences describe someone's pain. Direction words are computed;
   nothing here is a verb aimed at the person. */

export interface ExperimentCopy {
  title: string;
  evidence: string;
  /** what it is not, on every ended result */
  caveat?: string;
}

/** the question the check-in puts, in the person's own words */
export function experimentQuestion(exp: Experiment): string {
  const w = exp.what.trim();
  return w.charAt(0).toUpperCase() + w.slice(1) + ' — did it happen today?';
}

/** the ending's words, on every result: what a pair takes */
export const EXPERIMENT_NEEDS =
  'What counts: the evening answer, then a check-in before noon the next day.';

export function experimentCopy(s: ExperimentState): ExperimentCopy {
  const what = '“' + s.exp.what.trim() + '”';
  const each = EXPERIMENT_MIN_GROUP_DAYS;
  if (s.verdict === 'running') {
    if (s.extended) {
      return {
        title: 'Day ' + s.day + ' · ' + what + ' · still collecting.',
        evidence: s.yes + ' yes and ' + s.no + ' no with a morning after; ' + each
          + ' each way is the floor, and the answer comes the day it is reached. ' + EXPERIMENT_NEEDS,
      };
    }
    return {
      title: 'Day ' + s.day + ' of ' + s.planned + ' · ' + what,
      evidence: s.yes + ' yes and ' + s.no + ' no with a morning after so far. ' + EXPERIMENT_NEEDS,
    };
  }
  if (s.verdict === 'insufficient') {
    return {
      title: 'Not enough days each way to compare.',
      evidence: s.yes + ' yes and ' + s.no + ' no with a morning after; ' + each
        + ' each is the floor. ' + EXPERIMENT_NEEDS,
      caveat: 'A real answer about the record, not about ' + what + ': the mornings were not there to read.',
    };
  }
  const y = s.yesMean as number, n = s.noMean as number, d = s.delta as number;
  if (s.verdict === 'observation') {
    return {
      title: 'No difference worth a sentence between mornings after ' + what
        + ' and mornings after days without it.',
      evidence: 'Mornings after averaged ' + y + ' (' + s.yes + ' days); after days without, '
        + n + ' (' + s.no + ' days).',
      caveat: 'That is a finding too: two weeks of your record, and the mornings looked alike either way. '
        + HEALTH_NON_CAUSATION,
    };
  }
  const size = Math.abs(d);
  return {
    title: 'Mornings after ' + what + ' ran ' + size + (size === 1 ? ' point ' : ' points ')
      + (d < 0 ? 'lower' : 'higher') + ' than mornings after days without it.',
    evidence: 'Mornings after averaged ' + y + ' (' + s.yes + ' days); after days without, '
      + n + ' (' + s.no + ' days).',
    caveat: 'You chose the days, so this is your record read back, not a test of the thing itself. '
      + HEALTH_NON_CAUSATION,
  };
}
