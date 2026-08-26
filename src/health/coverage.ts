/**
 * Factor coverage — which of the app's factors Apple Health can answer,
 * and how well it has been answering lately.
 *
 * This is Phase-8 plumbing for the future adaptive-question selector:
 * clean read-only facts, no behaviour. The selector this feeds will
 * eventually decide, after a pain check-in, whether ONE optional
 * context question is worth its burden — by asking, in order:
 *
 *   1. which confirmed factors matter (the active protocol, via
 *      activeFactorIds — not this file's business);
 *   2. which of those Health already covers (healthCoverageFor, below —
 *      a covered factor should never be asked manually);
 *   3. which need manual input (the complement);
 *   4. which lack balanced observations (protocol.reviewProgress
 *      already reports group sizes — reuse it, do not duplicate it);
 *   5. what was recently asked (the entries record answers with
 *      timestamps; recency is a query, not new state).
 *
 * Nothing here creates UI, questions, or state. It measures.
 *
 * THE MAPPING IS DELIBERATELY NARROW. Health covers a factor only where
 * the sensor genuinely answers the question the metric asks. Steps
 * genuinely answer "how much did you move today"; they do not answer
 * "how stressed do you feel", and no amount of HRV enthusiasm makes
 * them. Factors Health cannot cover stay manual, and medication stays
 * out of everything, as metrics.ts already insists.
 */
import { Entries, addDays, logsOf } from '../model';
import { HealthCategory, HealthDay } from './types';

/** metric id → the Health category that can genuinely answer it.
 *  Absence means Health cannot cover the factor, full stop. */
export const FACTOR_HEALTH_COVERAGE: Record<string, HealthCategory> = {
  'sleep.quality.v1': 'sleep',
  'movement.amount.v1': 'movement',
  'load.physical.v1': 'movement',
  'recovery.practice.v1': 'workouts',
};

/** can Health, in principle, cover this factor? */
export function healthCoverageFor(metricId: string): HealthCategory | null {
  return FACTOR_HEALTH_COVERAGE[metricId] || null;
}

export interface FactorCoverage {
  metricId: string;
  category: HealthCategory | null;
  /** of the last `lookback` days, how many have Health data for the
   *  category — the honest measure of whether coverage is real on this
   *  person's phone, not just granted on a sheet */
  coveredDays: number;
  /** days in the window with any pain check-in, for the denominator */
  loggedDays: number;
}

/** coverage over the recent window, per factor id asked about */
export function factorCoverage(
  metricIds: string[],
  entries: Entries,
  health: Record<string, HealthDay>,
  todayIso: string,
  lookback = 14
): FactorCoverage[] {
  const from = addDays(todayIso, -(lookback - 1));
  const dates: string[] = [];
  for (let d = from; d <= todayIso; d = addDays(d, 1)) dates.push(d);

  return metricIds.map((metricId) => {
    const category = healthCoverageFor(metricId);
    let coveredDays = 0, loggedDays = 0;
    dates.forEach((date) => {
      if (entries[date] && logsOf(entries[date]).length) loggedDays++;
      if (category && health[date] && health[date].coverage[category]) coveredDays++;
    });
    return { metricId, category, coveredDays, loggedDays };
  });
}
