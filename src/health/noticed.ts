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
 * category licenses its own associations, and only those: heart
 * licenses NOTHING by design, mind exactly one, and the whole search
 * space is a handful of predefined questions, never a scan. Focus remains the vehicle for
 * what no sensor can answer — stress, weather, alcohol — and gates the
 * manual questions exactly as before.
 *
 * Pure: entries, health days and the connected categories in, verdicts
 * out. What was previously shown travels in as an argument and back
 * out as data — the caller owns remembering it.
 */
import { Entries } from '../model';
import { EARLY_MIN_PAIRED_DAYS, HEALTH_MIN_PAIRED_DAYS } from '../thresholds';
import { Association, EarlyLook, earlyLook, evaluate } from './engine';
import { LoadBudget, loadBudget } from './budget';
import { HealthCategory, HealthDay } from './types';
import { PairKind, PairedDay, buildPairs } from './windows';

/** connected category → the associations it licenses. Heart is
 *  deliberately absent: imported, normalized, never examined. Mind
 *  licenses exactly one, worded as accompaniment (engine.ts). */
export const CATEGORY_ASSOCIATIONS: Partial<Record<HealthCategory, PairKind[]>> = {
  sleep: ['sleepVsMorning'],
  movement: ['prevDayStepsVsMorning', 'stepsBeforeVsEvening', 'standBeforeVsEvening'],
  workouts: ['workoutVsNextMorning', 'workoutLoadVsNextMorning'],
  mind: ['mindVsEvening'],
  nutrition: ['waterBeforeVsEvening', 'caffeineBeforeVsEvening', 'alcoholVsNextMorning'],
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

/** The load budget, read from the workout-load association among the
 *  ones already evaluated — licensed by the same category, gated by
 *  the same verdict, and null whenever the association is. The pairs
 *  are rebuilt here so the budget's tercile boundary is computed on
 *  exactly the list the verdict was. */
export function loadBudgetFor(
  entries: Entries,
  health: Record<string, HealthDay>,
  all: Association[]
): LoadBudget | null {
  const a = all.filter((x) => x.kind === 'workoutLoadVsNextMorning')[0] || null;
  if (!a || a.verdict !== 'possible') return null;
  return loadBudget(buildPairs('workoutLoadVsNextMorning', entries, health), a);
}

/** what each licensed comparison is still waiting for — the ones short
 *  of the paired-days gate, with the count. A person who logs at lunch
 *  never produces a morning pair and was never told; this is how they
 *  are told. */
export interface HealthProgress {
  kind: PairKind;
  pairedDays: number;
  needed: number;
}

export function healthProgress(
  entries: Entries,
  health: Record<string, HealthDay>,
  categories: HealthCategory[]
): HealthProgress[] {
  return licensedKinds(categories)
    .map((kind) => ({
      kind,
      pairedDays: buildPairs(kind, entries, health).length,
      needed: HEALTH_MIN_PAIRED_DAYS,
    }))
    .filter((p) => p.pairedDays < p.needed);
}

/** the early looks the connected categories license — the comparisons
 *  past EARLY_MIN_PAIRED_DAYS and short of the gate, drawn as pictures */
export function earlyLooks(
  entries: Entries,
  health: Record<string, HealthDay>,
  categories: HealthCategory[]
): EarlyLook[] {
  return licensedKinds(categories)
    .map((kind) => earlyLook(kind, buildPairs(kind, entries, health)))
    .filter((e): e is EarlyLook => e != null);
}

/** THE FIRST DAYS. Before even an early look — one to three paired
 *  days — the record has facts and no comparison, and a person who
 *  connected Health yesterday deserves to see the fact rather than a
 *  counter. So the pairs themselves are listed: the night, the
 *  morning's number; the mood, the evening's number. Each row is what
 *  they entered beside what Health measured, nothing derived, and the
 *  caption says a comparison is still to come. */
export interface FirstDays {
  kind: PairKind;
  pairs: PairedDay[];
}

export function firstDays(
  entries: Entries,
  health: Record<string, HealthDay>,
  categories: HealthCategory[]
): FirstDays[] {
  return licensedKinds(categories)
    .map((kind) => ({ kind, pairs: buildPairs(kind, entries, health).slice().sort((a, b) => a.date < b.date ? 1 : -1) }))
    .filter((f) => f.pairs.length >= 1 && f.pairs.length < EARLY_MIN_PAIRED_DAYS);
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
