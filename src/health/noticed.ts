/**
 * Which health associations may even be LOOKED AT, and what came of
 * looking — the bridge between the user's consent and the engine.
 *
 * CONSENT IS THE HEALTH SETUP ITSELF. The user picked categories on
 * Pattern's sheet and confirmed them type-by-type on Apple's; that is
 * them asking Pattern to watch sleep, or movement, or workouts, and
 * demanding a second confirmation through the focus flow was double
 * consent wearing principle's clothes — connecting sleep and then
 * seeing nothing because a different switch was off. So each connected
 * category licenses its own associations, and only those: heart and
 * mind license NOTHING by design, and the whole search space is five
 * predefined questions, never a scan. Focus remains the vehicle for
 * what no sensor can answer — stress, weather, alcohol — and gates the
 * manual questions exactly as before.
 *
 * Pure: entries, health days and the connected categories in, verdicts
 * out. What was previously shown travels in as an argument and back
 * out as data — the caller owns remembering it.
 */
import { Entries } from '../model';
import { Association, evaluate } from './engine';
import { HealthCategory, HealthDay } from './types';
import { PairKind, buildPairs } from './windows';

/** connected category → the associations it licenses. Heart and mind
 *  are deliberately absent: imported, normalized, never examined. */
export const CATEGORY_ASSOCIATIONS: Partial<Record<HealthCategory, PairKind[]>> = {
  sleep: ['sleepVsMorning'],
  movement: ['prevDayStepsVsMorning', 'stepsBeforeVsEvening'],
  workouts: ['workoutVsNextMorning', 'workoutLoadVsNextMorning'],
};

/** the association kinds the connected categories license, deduped */
export function licensedKinds(categories: HealthCategory[]): PairKind[] {
  const seen: Record<string, true> = {};
  const out: PairKind[] = [];
  categories.forEach((c) => {
    (CATEGORY_ASSOCIATIONS[c] || []).forEach((k) => {
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
  categories: HealthCategory[],
  previouslyShown: PairKind[]
): Association[] {
  return licensedKinds(categories).map((kind) =>
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
