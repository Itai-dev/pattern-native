/** Presentation data for Patterns. Every row, including early pictures
 *  and missing-data explanations, is rebuilt inside the selected range.
 *  A smaller range is not evidence that an old finding has faded. */
import { Entries } from '../model';
import { DOSE_MIN_PAIRS, EARLY_MIN_PAIRED_DAYS, HEALTH_MIN_PAIRED_DAYS } from '../thresholds';
import { HealthCategory, HealthDay } from './types';
import { licensedKinds } from './noticed';
import { buildPairs, PairKind, PairedDay } from './windows';
import {
  Association, associationCopy, earlyLook, EarlyLook, evaluate, groupLabels,
  HEALTH_NON_CAUSATION, IN_BED_NOTE, progressCopy,
} from './engine';
import {
  DoseAssociation, doseAssociations, doseCopy, dosePairs, doseProgress,
  DOSE_NON_CAUSATION, DOSE_TIMING, earlyDoses, DoseEarly,
} from './doses';

export type ComparisonStatus = 'Worth watching' | 'No clear association' | 'Still collecting';
export interface Comparison {
  id: string;
  family: 'Sleep' | 'Activity' | 'Medications' | 'Mood' | 'Nutrition';
  title: string;
  status: ComparisonStatus;
  summary: string;
  evidence: string;
  timing: string;
  caveat: string;
  from?: string;
  to?: string;
  health?: Association;
  early?: EarlyLook;
  dose?: DoseAssociation | DoseEarly;
  paired?: PairedDay[];
  pairedDoses?: { date: string; before: number; after: number }[];
  first?: PairedDay[];
  firstDoses?: { date: string; before: number; after: number }[];
}

export function scopeHealthRecord(entries: Entries, health: Record<string, HealthDay>, from: string, to: string) {
  const within = (date: string) => date >= from && date <= to;
  return {
    entries: Object.fromEntries(Object.entries(entries).filter(([d]) => within(d))),
    health: Object.fromEntries(Object.entries(health).filter(([d]) => within(d))),
  };
}

const familyOf = (kind: PairKind): Comparison['family'] => kind === 'sleepVsMorning' ? 'Sleep'
  : kind === 'mindVsEvening' ? 'Mood'
    : ['waterBeforeVsEvening', 'caffeineBeforeVsEvening', 'alcoholVsNextMorning'].includes(kind) ? 'Nutrition' : 'Activity';

/** Shared by the headline and every secondary row. A row is never
 *  labelled "no difference" merely because another one ranked first. */
export function associationSummary(a: Association): Pick<Comparison, 'status' | 'summary'> {
  const copy = associationCopy(a);
  if (copy) return { status: 'Worth watching', summary: copy.body };
  if (a.verdict === 'observation') return {
    status: 'No clear association',
    summary: 'These days do not show a clear, consistent association. The groups may be too similar, or their differences may not hold across the record.',
  };
  return { status: 'Still collecting', summary: 'There is not enough comparable information for a finding yet.' };
}

export function buildComparisons(
  entries: Entries, health: Record<string, HealthDay>, categories: HealthCategory[], from: string, to: string
): Comparison[] {
  const scoped = scopeHealthRecord(entries, health, from, to);
  const rows: Comparison[] = licensedKinds(categories).map(kind => {
    const pairs = buildPairs(kind, scoped.entries, scoped.health);
    const a = evaluate(kind, pairs);
    const early = earlyLook(kind, pairs) || undefined;
    const words = groupLabels(kind);
    const copy = associationCopy(a);
    const description = associationSummary(a);
    if (a.verdict === 'insufficient') {
      description.summary = progressCopy({ kind, pairedDays: pairs.length, needed: HEALTH_MIN_PAIRED_DAYS }).caveat
        + ' Check in when it suits you; missed days are fine.';
      if (pairs.length >= HEALTH_MIN_PAIRED_DAYS) {
        description.summary = 'There are enough paired days to look at, but not enough recorded days on both sides of this comparison.';
      } else if (kind === 'sleepVsMorning' && pairs.length === 0) {
        description.summary = Object.values(scoped.health).some(h => h.sleepMinutes != null)
          ? 'Sleep data is available, but no morning check-ins match it in this range. A morning check-in can put the two beside each other.'
          : 'No sleep readings are available in this range. You can review what Pattern reads from Apple Health in Profile.';
      }
    }
    const dates = pairs.map(p => p.date).sort();
    return {
      id: kind, family: familyOf(kind), title: words.factor + ' and ' + words.outcome,
      ...description,
      evidence: copy?.sample || pairs.length + ' paired ' + (pairs.length === 1 ? 'day' : 'days') + ' in this range.',
      timing: words.timing,
      caveat: (early ? 'An early picture, not a finding. ' : '') + HEALTH_NON_CAUSATION
        + (pairs[0]?.basis === 'inBed' ? ' ' + IN_BED_NOTE : ''),
      from: dates[0], to: dates[dates.length - 1], health: a, early, paired: pairs,
      first: pairs.length < EARLY_MIN_PAIRED_DAYS ? pairs : undefined,
    };
  });
  if (categories.includes('medications')) {
    const all = doseAssociations(scoped.entries, scoped.health, []);
    const waiting = doseProgress(scoped.entries, scoped.health);
    const early = earlyDoses(scoped.entries, scoped.health);
    const pairs = dosePairs(scoped.entries, scoped.health);
    const ids = Array.from(new Set(all.map(a => a.medId).concat(waiting.map(p => p.medId))));
    ids.forEach(id => {
      const a = all.find(a => a.medId === id);
      const p = waiting.find(p => p.medId === id);
      const picture = early.find(e => e.medId === id);
      const copy = a && doseCopy(a);
      const ps = pairs.filter(p => p.medId === id);
      const med = a?.med || p!.med;
      rows.push({
        pairedDoses: ps, id: 'dose:' + id, family: 'Medications', title: med + ' and pain around a dose',
        status: copy ? 'Worth watching' : a?.verdict === 'observation' ? 'No clear association' : 'Still collecting',
        summary: copy ? copy.body : a?.verdict === 'observation'
          ? 'Average pain was similar before and after these doses. This does not establish whether the medication helped.'
          : 'This comparison needs check-ins before and after logged doses. Keep to your prescribed routine; there is no need to take a dose for this comparison.',
        evidence: copy ? copy.sample : ps.length + ' doses with a matching check-in before and after in this range.',
        timing: DOSE_TIMING, caveat: (picture ? 'An early picture, not a finding. ' : '') + DOSE_NON_CAUSATION,
        from: ps[0]?.date, to: ps[ps.length - 1]?.date,
        dose: a && a.before !== undefined ? a : picture,
        firstDoses: !picture && (!a || a.pairs < DOSE_MIN_PAIRS) ? ps : undefined,
      });
    });
    if (!ids.length) rows.push({
      id: 'medications', family: 'Medications', title: 'Pain around logged doses', status: 'Still collecting',
      summary: 'No taken doses are available in this range. If you already log them in Apple Health, review the medications shared with Pattern in Profile.',
      evidence: '', timing: DOSE_TIMING, caveat: DOSE_NON_CAUSATION,
    });
  }
  return rows;
}

/** Keep the leading observation stable: more paired evidence first,
 *  with a deterministic tie. Do not rank unlike comparisons by delta. */
export function leadingComparison(rows: Comparison[]): Comparison | null {
  const support = (r: Comparison) => r.health?.pairedDays ?? r.dose?.pairs ?? 0;
  return rows.filter(r => r.status === 'Worth watching')
    .sort((a, b) => support(b) - support(a) || a.id.localeCompare(b.id))[0] || null;
}
