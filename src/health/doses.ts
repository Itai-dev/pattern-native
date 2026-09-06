/**
 * Medication doses beside pain — the one health comparison that is
 * NOT a split of days into groups, and the reasons it is shaped
 * differently.
 *
 * THE QUESTION. A dose logged in the Health app is an instant, and the
 * honest question about an instant is "what was the number just before
 * it, and what was the number after". So each dose is paired with the
 * last check-in shortly before it and the first check-in a while after
 * it — the same person, the same day, the same scale — and the
 * comparison is the mean of those paired differences. No terciles: the
 * control for a dose is the check-in before that dose, not some other
 * day's.
 *
 * THE TRAP, NAMED. People take a painkiller when pain is high, and high
 * pain tends to come down on its own. A record of "lower after a dose"
 * is therefore expected even from a sugar pill, and the card says so in
 * the same breath as the number. What this comparison can honestly
 * offer is a description of what happened around doses, with the
 * regression to the mean stated beside it, never a claim of effect —
 * and "no change after a dose, across twelve doses" is at least as
 * worth a clinician's minute as the other direction.
 *
 * THE WINDOWS. The check-in before must be within DOSE_BEFORE_WINDOW_MIN
 * of the dose, or it describes a different afternoon. The check-in
 * after must be at least DOSE_AFTER_MIN_MIN later — a number logged
 * five minutes after a tablet measures nothing about the tablet — and
 * no more than DOSE_AFTER_MAX_MIN, past which the day has moved on.
 * ONE PAIR PER DAY PER MEDICATION, the first dose that has a lawful
 * pair: a person logging four doses and six check-ins is one day,
 * observed closely, not four pieces of evidence.
 *
 * WHAT IT CAN NEVER RETURN: a recommendation, a dose, "take it
 * earlier", "it works", "it doesn't". The engine reads times and
 * numbers the user already recorded and describes them. Skipped doses
 * are shown on the day and never compared — a skipped dose is not an
 * exposure, and "skipped days" is exactly the confounded comparison
 * this file refuses.
 */
import { Entries, logsOf } from '../model';
import {
  DOSE_AFTER_MAX_MIN, DOSE_AFTER_MIN_MIN, DOSE_BEFORE_WINDOW_MIN, DOSE_MIN_PAIRS,
  HEALTH_MIN_DELTA,
} from '../thresholds';
import { Verdict } from './engine';
import { HealthDay, NormalizedDose } from './types';

/** one lawful dose pair: the check-in before, the first one after */
export interface DosePair {
  date: string;
  medId: string;
  med: string;
  before: number;
  after: number;
}

export interface DoseAssociation {
  medId: string;
  med: string;
  verdict: Verdict;
  /** lawful pairs seen at all */
  pairs: number;
  /** mean pain before and after, present from `observation` up */
  before?: number;
  after?: number;
  /** after minus before, rounded to 0.1 — negative is lower after */
  delta?: number;
  from?: string;
  to?: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** the taken doses of a day, in time order — the only status that is
 *  an exposure */
function takenDoses(day: HealthDay | undefined): NormalizedDose[] {
  if (!day || !day.doses) return [];
  return day.doses.filter((d) => d.status === 'taken').slice().sort((a, b) => a.h - b.h);
}

/**
 * Every lawful pair across the record — one per day per medication.
 * Pure: entries and normalized days in, pairs out.
 */
export function dosePairs(entries: Entries, health: Record<string, HealthDay>): DosePair[] {
  const out: DosePair[] = [];
  Object.keys(entries).sort().forEach((date) => {
    const logs = logsOf(entries[date]).slice().sort((a, b) => a.h - b.h);
    if (!logs.length) return;
    const doses = takenDoses(health[date]);
    const paired: Record<string, true> = {};
    doses.forEach((dose) => {
      if (paired[dose.medId]) return;
      let before: number | null = null;
      let after: number | null = null;
      logs.forEach((l) => {
        if (l.h <= dose.h && dose.h - l.h <= DOSE_BEFORE_WINDOW_MIN) before = l.pain;
        if (after == null && l.h - dose.h >= DOSE_AFTER_MIN_MIN
          && l.h - dose.h <= DOSE_AFTER_MAX_MIN) after = l.pain;
      });
      if (before == null || after == null) return;
      paired[dose.medId] = true;
      out.push({ date, medId: dose.medId, med: dose.med, before, after });
    });
  });
  return out;
}

/** evaluate one medication's pairs. `previouslyShown` feeds the fading
 *  rule and nothing else — a shown change that stops holding says so. */
export function evaluateDoses(
  medId: string, med: string, pairs: DosePair[], previouslyShown = false
): DoseAssociation {
  const base: DoseAssociation = { medId, med, verdict: 'insufficient', pairs: pairs.length };
  const fade = (a: DoseAssociation): DoseAssociation =>
    previouslyShown && a.verdict !== 'possible' ? { ...a, verdict: 'fading' } : a;
  if (pairs.length < DOSE_MIN_PAIRS) return fade(base);
  const before = round1(mean(pairs.map((p) => p.before)));
  const after = round1(mean(pairs.map((p) => p.after)));
  const delta = round1(mean(pairs.map((p) => p.after - p.before)));
  const dates = pairs.map((p) => p.date).sort();
  const full: DoseAssociation = {
    ...base, verdict: 'observation', before, after, delta,
    from: dates[0], to: dates[dates.length - 1],
  };
  if (Math.abs(delta) < HEALTH_MIN_DELTA) return fade(full);
  return { ...full, verdict: 'possible' };
}

/** every medication with pairs, evaluated, in name order — deterministic
 *  so the same record always reads the same */
export function doseAssociations(
  entries: Entries, health: Record<string, HealthDay>, previouslyShown: string[]
): DoseAssociation[] {
  const by: Record<string, DosePair[]> = {};
  const names: Record<string, string> = {};
  dosePairs(entries, health).forEach((p) => {
    (by[p.medId] = by[p.medId] || []).push(p);
    names[p.medId] = p.med;
  });
  return Object.keys(by)
    .sort((a, b) => names[a].localeCompare(names[b]))
    .map((id) => evaluateDoses(id, names[id], by[id], previouslyShown.indexOf(id) >= 0));
}

/** the strongest `possible`, or null — one sentence, never a list */
export function strongestDose(all: DoseAssociation[]): DoseAssociation | null {
  let best: DoseAssociation | null = null;
  all.forEach((a) => {
    if (a.verdict !== 'possible' || a.delta == null) return;
    if (!best || Math.abs(a.delta) > Math.abs(best.delta as number)) best = a;
  });
  return best;
}

/** what each medication seen in Health is still waiting for — every
 *  medication with a taken dose in the record, short of the gate, so a
 *  person who logs doses but never checks in around them learns what
 *  one pair takes */
export interface DoseProgress {
  medId: string;
  med: string;
  pairs: number;
  needed: number;
}

export function doseProgress(
  entries: Entries, health: Record<string, HealthDay>
): DoseProgress[] {
  const names: Record<string, string> = {};
  Object.keys(health).forEach((d) => {
    takenDoses(health[d]).forEach((x) => { names[x.medId] = x.med; });
  });
  const counts: Record<string, number> = {};
  dosePairs(entries, health).forEach((p) => { counts[p.medId] = (counts[p.medId] || 0) + 1; });
  return Object.keys(names)
    .sort((a, b) => names[a].localeCompare(names[b]))
    .map((id) => ({ medId: id, med: names[id], pairs: counts[id] || 0, needed: DOSE_MIN_PAIRS }))
    .filter((p) => p.pairs < p.needed);
}

/* ── copy, from numbers ──────────────────────────────────────
   Fixed sentence shapes, the numbers inserted; the regression line is
   part of the card, not a footnote, because it is the one thing that
   makes the number readable. */

export const DOSE_NON_CAUSATION =
  'A dose is often taken when pain is high, and high pain tends to come down on its own. '
  + 'This is what your record shows around doses, not what the medicine did.';

function windowWords(): string {
  const hours = (m: number) => (m % 60 === 0 ? (m / 60) + (m === 60 ? ' hour' : ' hours') : m + ' minutes');
  return 'a check-in within ' + hours(DOSE_BEFORE_WINDOW_MIN) + ' before a dose and another '
    + DOSE_AFTER_MIN_MIN + ' minutes to ' + hours(DOSE_AFTER_MAX_MIN) + ' after it';
}

/** the timing sentence — the direction of time, spelled out */
export const DOSE_TIMING =
  'Each dose you logged in Health is compared with your check-in shortly before it and the '
  + 'first one after. One dose a day is counted for each medication.';

export interface DoseCopy {
  title: string;
  body: string;
  sample: string;
  timing: string;
  disclaimer: string;
}

/** the card's words for a `possible` dose association; nothing for any
 *  other verdict, deliberately */
export function doseCopy(a: DoseAssociation): DoseCopy | null {
  if (a.verdict !== 'possible' || a.delta == null) return null;
  const size = Math.abs(a.delta);
  const dir = a.delta < 0 ? 'lower' : 'higher';
  return {
    title: a.med + ' may be worth watching',
    body: 'Your pain averaged ' + size + (size === 1 ? ' point ' : ' points ') + dir
      + ' at the first check-in after a dose of ' + a.med + ' than at the one before it.',
    sample: 'Based on ' + a.pairs + ' doses, each with ' + windowWords() + '.',
    timing: DOSE_TIMING,
    disclaimer: DOSE_NON_CAUSATION,
  };
}

/** the words for an observation whose pairs formed but did not differ */
export function doseObservationCopy(a: DoseAssociation): string {
  return 'No meaningful change from before a dose of ' + a.med + ' to after it, across '
    + a.pairs + ' doses — that is a finding about these doses, not a failure of them.';
}

/** the "still collecting" row for a medication short of its gate */
export function doseProgressCopy(p: DoseProgress): { title: string; evidence: string; caveat: string } {
  return {
    title: p.med + ' and pain around a dose',
    evidence: p.pairs + ' of ' + p.needed + ' doses so far.',
    caveat: 'Each one takes ' + windowWords() + '.',
  };
}

/** the line for a previously shown dose association that stopped holding */
export function fadedDoseCopy(a: DoseAssociation): string {
  return 'The earlier change around doses of ' + a.med
    + ' hasn’t stayed consistent as more doses arrived. That happens, and it'
    + ' is worth knowing — it is why Pattern waits before saying anything.';
}
