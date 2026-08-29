/**
 * Which health associations may even be LOOKED AT, and what came of
 * looking — the bridge between the user's confirmed focus and the
 * engine.
 *
 * The gate that matters here: an association is evaluated only when
 * its factor is one the user confirmed — the active observation
 * protocol's factors, chosen through the existing focus flow. Health
 * data being present is never, on its own, a reason to go looking.
 * A correlation engine pointed at everything it can reach is a machine
 * for finding accidents, and four user-asked questions is the entire
 * search space.
 *
 * Pure: entries, health days and the confirmed factor ids in, verdicts
 * out. What was previously shown travels in as an argument and back
 * out as data — the caller owns remembering it.
 */
import { Entries } from '../model';
import { Association, evaluate } from './engine';
import { HealthDay } from './types';
import { PairKind, buildPairs } from './windows';

/** confirmed factor id → the associations it licenses. Sleep licenses
 *  the sleep pairing; the movement-shaped factors license the activity
 *  pairings. Nothing else licenses anything — stress, weather and the
 *  rest have no honest sensor here, and heart/mind data licenses
 *  nothing by design. */
export const FACTOR_ASSOCIATIONS: Record<string, PairKind[]> = {
  'sleep.quality.v1': ['sleepVsMorning'],
  'movement.amount.v1': ['prevDayStepsVsMorning', 'stepsBeforeVsEvening'],
  'load.physical.v1': [
    'prevDayStepsVsMorning', 'stepsBeforeVsEvening',
    'workoutVsNextMorning', 'workoutLoadVsNextMorning',
  ],
};

/** the association kinds the given confirmed factors license, deduped */
export function licensedKinds(confirmedFactorIds: string[]): PairKind[] {
  const seen: Record<string, true> = {};
  const out: PairKind[] = [];
  confirmedFactorIds.forEach((id) => {
    (FACTOR_ASSOCIATIONS[id] || []).forEach((k) => {
      if (!seen[k]) { seen[k] = true; out.push(k); }
    });
  });
  return out;
}

/** evaluate everything licensed. `previouslyShown` marks kinds whose
 *  `possible` verdict has already been rendered to this user, so a
 *  finding that stops holding fades out loud instead of vanishing. */
export function noticedAssociations(
  entries: Entries,
  health: Record<string, HealthDay>,
  confirmedFactorIds: string[],
  previouslyShown: PairKind[]
): Association[] {
  return licensedKinds(confirmedFactorIds).map((kind) =>
    evaluate(kind, buildPairs(kind, entries, health), previouslyShown.indexOf(kind) >= 0));
}

/** The single strongest `possible`, or null — PATTERN_MAX_CARDS is a
 *  house rule: never a list of findings, only the one most worth a
 *  sentence, and the rest keep accumulating quietly. */
export function strongestPossible(all: Association[]): Association | null {
  let best: Association | null = null;
  all.forEach((a) => {
    if (a.verdict !== 'possible' || a.delta == null) return;
    if (!best || Math.abs(a.delta) > Math.abs(best.delta as number)) best = a;
  });
  return best;
}
