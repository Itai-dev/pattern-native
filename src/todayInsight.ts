import { Association, associationCopy, EarlyLook, factorLabel, groupLabels, progressCopy, IN_BED_NOTE } from './health/engine';
import { DoseAssociation, doseCopy } from './health/doses';
import { FirstDays, HealthProgress } from './health/noticed';
import { formatScore } from './painScale';

export interface TodayInsight { title: string; body: string; context: string; caveat: string; action: string }

/** One useful door into the record. Early data is described as facts;
 *  only the shared engine can authorize an association sentence. */
export function todayInsight(record: {
  best: Association | null; first: FirstDays[]; early: EarlyLook[]; progress: HealthProgress[];
  doses: { best: DoseAssociation | null };
}): TodayInsight | null {
  const copy = (record.best && associationCopy(record.best))
    || (record.doses.best && doseCopy(record.doses.best));
  if (copy) return { title: copy.title, body: copy.body,
    context: copy.sample + ' ' + copy.timing + (record.best?.basis === 'inBed' ? ' ' + IN_BED_NOTE : ''),
    caveat: copy.disclaimer, action: 'See the comparison' };
  const early = record.early[0];
  if (early) return {
    title: 'Your first comparisons are ready to look at',
    body: groupLabels(early.kind).factor + ' sits beside your pain check-ins across ' + early.pairedDays + ' paired days.',
    context: groupLabels(early.kind).timing,
    caveat: 'This is an early picture, not a pattern or a cause. It can change as you add days.',
    action: 'Explore the early picture',
  };
  const first = record.first.find(f => f.pairs.length > 0);
  if (first) {
    const pair = first.pairs.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      title: 'Your record is starting to connect',
      body: groupLabels(first.kind).factor + ': ' + factorLabel(first.kind, pair.factor)
        + ', beside a pain check-in of ' + formatScore(pair.pain) + '/10.',
      context: pair.date + '. ' + groupLabels(first.kind).timing + (pair.basis === 'inBed' ? ' ' + IN_BED_NOTE : ''),
      caveat: 'One paired day is a fact, not a finding. No conclusion yet.',
      action: 'See these first days',
    };
  }
  const waiting = record.progress.find(p => p.pairedDays > 0) || record.progress[0];
  if (!waiting) return null;
  return {
    title: 'What will make this record useful',
    body: progressCopy(waiting).title + '. ' + progressCopy(waiting).caveat,
    context: waiting.pairedDays + ' paired days so far. Ordinary days count too; missed days are fine.',
    caveat: 'There is not enough comparable information for a finding yet.',
    action: 'See what is collecting',
  };
}
