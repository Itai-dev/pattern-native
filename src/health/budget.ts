/**
 * The load budget — the person's own workout threshold, said BEFORE the
 * workout instead of the morning after.
 *
 * WHY THIS EXISTS. Every other sentence in this app describes a record
 * after the fact: harder mornings followed harder workouts. That is
 * true and it is late — the morning has already happened. The budget
 * is the same association read forward: where, in minutes, the
 * person's own harder-workout days begin. A number a person can hold
 * in their head while they are still deciding whether to do one more
 * round. It is the first thing the app says that is about the next
 * decision rather than the last one.
 *
 * WHAT IT IS NOT. Not a limit, not a plan, and never "stop". Exercise
 * helps most chronic pain and the soreness after it is not damage; an
 * app that tells people to dial down feeds fear-avoidance, which makes
 * pain worse over months. What it protects against is boom-and-bust:
 * the session that costs tomorrow. So the copy says what the record
 * shows and where the line sat, and the person decides. Exercise
 * prescription waits for a clinician (POSITIONING.md); a description
 * of your own record does not.
 *
 * WHERE THE NUMBERS COME FROM. Nothing new is computed. The
 * association is the engine's own workoutLoadVsNextMorning verdict,
 * with every gate it already clears — paired days, group sizes, the
 * twenty-minute spread, the 1.5-point delta. The budget adds two
 * readings of the same pairs: the median load (your usual) and the
 * smallest load in the upper tercile (where your harder third begins).
 * The tercile split is the engine's, index for index, so the number
 * printed is the boundary of the group the sentence is about.
 *
 * ONE DIRECTION ONLY. A budget exists when MORE load paired with
 * HARDER mornings. The other direction — longer workouts, easier
 * mornings — is real and the association card already shows it, but
 * a budget that reads "do more" is advice wearing a number, and the
 * person did not ask for a training plan.
 */
import { BUDGET_MIN_HEADROOM_MINUTES } from '../thresholds';
import { formatScore } from '../painScale';
import { Association, HEALTH_NON_CAUSATION } from './engine';
import { PairedDay } from './windows';

export interface LoadBudget {
  /** the person's usual workout day: the median total workout minutes
   *  across the paired days, rounded to a minute */
  usualMinutes: number;
  /** where the harder-workout third begins: the smallest total load in
   *  the engine's upper tercile, rounded to a minute */
  pastMinutes: number;
  /** the association the budget is read from — its groups, delta and
   *  dates are the evidence the sentence cites */
  association: Association;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * A budget from the workout-load pairs and their evaluated association,
 * or null — silence is the default here as everywhere.
 *
 * `pairs` must be the same pairs the association was evaluated from;
 * the tercile boundary is recomputed with the engine's arithmetic and
 * would be a different number on a different list.
 */
export function loadBudget(pairs: PairedDay[], a: Association | null): LoadBudget | null {
  if (!a || a.kind !== 'workoutLoadVsNextMorning') return null;
  if (a.verdict !== 'possible' || a.delta == null || a.delta <= 0) return null;
  if (!a.low || !a.high || !pairs.length) return null;

  const sorted = pairs.map((p) => p.factor).slice().sort((x, y) => x - y);
  /* the engine's split: Math.floor(n / 3) a side, middle discarded */
  const third = Math.floor(sorted.length / 3);
  if (third < 1) return null;
  const usual = median(sorted);
  const past = sorted[sorted.length - third];

  /* the line must sit clear of the usual, or it is a sentence about
     every workout — see the threshold's argument */
  if (past - usual < BUDGET_MIN_HEADROOM_MINUTES) return null;

  return {
    usualMinutes: Math.round(usual),
    pastMinutes: Math.round(past),
    association: a,
  };
}

/** what the budget does not mean — inside the card, never a footnote */
export const BUDGET_NOTE =
  'A description of your record, not a limit or a plan. Exercise helps most '
  + 'persistent pain; this is about the session that costs the next morning.';

/** the short form of the note, for a lock screen — one sentence, the
 *  one that matters most when there is room for one */
export const BUDGET_NOTE_SHORT = 'A description of your record, not a limit.';

/**
 * The budget as a notification body — the sentence and the short note,
 * nothing else. No groups, no dates: it lands on a lock screen, is
 * read in the time it takes to lift a phone, and the evidence is one
 * tap away on Trends. Never a verb aimed at the person.
 */
export function budgetNotification(b: LoadBudget): string {
  return budgetCopy(b).title + ' ' + BUDGET_NOTE_SHORT;
}

export interface BudgetCopy {
  key: string;
  /** the sentence a person can carry into a workout */
  title: string;
  /** the groups behind it, with their sizes */
  evidence: string;
  /** what it is not, and the non-causation line */
  caveat: string;
}

/**
 * Fixed sentence shapes with the numbers inserted — deterministic, like
 * every generated sentence in this app, because these words describe
 * someone's pain. `range` is the dates, already formatted by the caller
 * in its own screen's style, or absent.
 */
export function budgetCopy(b: LoadBudget, range?: string): BudgetCopy {
  const a = b.association;
  const high = a.high!, low = a.low!;
  return {
    key: 'budget.workout',
    title: 'Your usual workout is about ' + b.usualMinutes + ' minutes. Past '
      + b.pastMinutes + ', your next mornings ran harder.',
    evidence: 'Mornings after workouts of ' + b.pastMinutes + ' min or more averaged '
      + formatScore(high.painMean) + ' (' + high.n + ' days); after your ' + low.n
      + ' lightest, ' + formatScore(low.painMean) + '.' + (range ? ' ' + range + '.' : ''),
    caveat: BUDGET_NOTE + ' ' + HEALTH_NON_CAUSATION,
  };
}
