/**
 * What helps, and what makes it worse — the one card Today leads with
 * (1 Oct 2026).
 *
 * WHY THIS REPLACED THE ACTIVITY CARD AT THE TOP. The founder's call:
 * the question people bring to a pain record is "what helps, and what
 * makes it worse", and the app already answered it in four places
 * nobody saw together — the experiment (removed from Today on 30 Sep),
 * the Health comparisons and the doses (on Patterns), and the activity
 * conclusions (Today's card). This file reads them into one list,
 * sorted by which way the days went, with the experiment running now
 * at the top because it is the one thing the person is actively
 * finding out. Activity is one of the rows, not the frame.
 *
 * NOTHING NEW IS CONCLUDED HERE. Every row is a verdict another module
 * already gated and already worded: experiment.ts, engine.ts, doses.ts,
 * capacity.ts. The one comparison born here — tiredness beside pain —
 * uses the experiment's group floor and the engine's delta, and says
 * "went with", because the same person rated both at the same moment
 * and nothing can tell which drives which.
 *
 * THE WORDS ON THE SIDES. "Went with better days" and "went with harder
 * days", never "helps" and "hurts": every row is a comparison of the
 * person's own days, and the card title can ask the question the person
 * asked without any row claiming to have answered it causally. "No
 * difference" is a side of its own — it is the answer that lets someone
 * stop worrying about a thing, and most apps hide it.
 *
 * WHAT IT NEVER DOES. Rank the person, score today, count a streak,
 * compare this week with last, or tell anyone to do anything. Between
 * two opens of the same day it returns the same thing unless the
 * person added data.
 *
 * Pure: everything in, the view out. App.tsx gathers the inputs.
 */
import { Entries, addDays, answerOf, logsOf } from './model';
import { FATIGUE_ID } from './metrics';
import { ExperimentState, experimentCopy, isAB } from './experiment';
import { Association, associationCopy } from './health/engine';
import { DoseAssociation, DOSE_NON_CAUSATION, doseCopy, doseObservationCopy } from './health/doses';
import { Insight } from './health/capacity';
import {
  HEALTH_MIN_DELTA, HELPS_TODAY_MAX, TIRED_MIN_GROUP_DAYS, TIRED_WINDOW_DAYS,
} from './thresholds';

export type HelpsSide = 'better' | 'harder' | 'compared' | 'same' | 'doing';

export interface HelpsRow {
  key: string;
  side: HelpsSide;
  /** the finding, one sentence */
  text: string;
  /** what it rests on — behind "Why?" */
  why: string;
  /** what it does not mean, beside it */
  caveat: string;
}

export interface HelpsView {
  /** the experiment running now, or ended and not yet put away */
  experiment: ExperimentState | null;
  /** every row, in display order: better, harder, compared, what you
   *  can do, no difference */
  rows: HelpsRow[];
  /** how many rows past the ones Today shows */
  more: number;
  /** nothing to show yet: the card says what it is waiting for */
  empty: boolean;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const pts = (n: number) => n + (n === 1 ? ' point' : ' points');

export const TIRED_CAVEAT =
  'You rated both at the same moment, so this says they travel together — not which one drives the other.';

export interface TiredComparison {
  high: { n: number; pain: number };
  low: { n: number; pain: number };
  /** high minus low, rounded to 0.1 */
  delta: number;
  verdict: 'possible' | 'observation';
}

/**
 * Pain at the check-in tiredness was answered with, on days it was
 * "High" against days it was "Low". Medium days sit out, as the middle
 * tercile does in the engine: the question is whether the ends differ.
 * A skip is not an answer; a day with tiredness and no check-in is not
 * a pair. Null until both ends reach the floor.
 */
export function tiredComparison(entries: Entries, todayIso: string): TiredComparison | null {
  const from = addDays(todayIso, -TIRED_WINDOW_DAYS + 1);
  const hi: number[] = [], lo: number[] = [];
  Object.keys(entries).forEach((d) => {
    if (d < from || d > todayIso) return;
    const a = answerOf(entries[d], FATIGUE_ID);
    if (!a || a.skipped || (a.value !== 'high' && a.value !== 'low')) return;
    const logs = logsOf(entries[d]).slice().sort((x, y) => x.h - y.h);
    if (!logs.length) return;
    /* the check-in it was asked with: the first at or after the answer,
       else the last before it — the same moment, as near as the record has */
    const at = logs.filter((l) => l.h >= a.h)[0] || logs[logs.length - 1];
    (a.value === 'high' ? hi : lo).push(at.pain);
  });
  if (hi.length < TIRED_MIN_GROUP_DAYS || lo.length < TIRED_MIN_GROUP_DAYS) return null;
  const h = round1(mean(hi)), l = round1(mean(lo));
  const delta = round1(h - l);
  return {
    high: { n: hi.length, pain: h }, low: { n: lo.length, pain: l }, delta,
    verdict: Math.abs(delta) >= HEALTH_MIN_DELTA ? 'possible' : 'observation',
  };
}

function tiredRow(t: TiredComparison): HelpsRow {
  const why = 'Pain averaged ' + t.high.pain + ' on ' + t.high.n + ' days you felt very tired and '
    + t.low.pain + ' on ' + t.low.n + ' days you felt little, at the check-in you answered it with.';
  if (t.verdict === 'observation') {
    return {
      key: 'tired', side: 'same', why, caveat: TIRED_CAVEAT,
      text: 'Tiredness: pain was about the same whether you felt very tired or not.',
    };
  }
  const size = Math.abs(t.delta);
  return {
    key: 'tired', side: t.delta > 0 ? 'harder' : 'better', why, caveat: TIRED_CAVEAT,
    text: 'On days you felt very tired, pain ran ' + pts(size) + ' ' + (t.delta > 0 ? 'higher' : 'lower')
      + ' than on days you felt little.',
  };
}

function experimentRow(s: ExperimentState): HelpsRow | null {
  if (!s.ended || s.verdict === 'running' || s.verdict === 'insufficient') return null;
  const c = experimentCopy(s);
  const side: HelpsSide = s.verdict === 'observation' ? 'same'
    : isAB(s.exp) ? 'compared'
    : (s.delta as number) < 0 ? 'better' : 'harder';
  return { key: 'x.' + s.exp.id, side, text: c.title, why: c.evidence, caveat: c.caveat || '' };
}

function healthRow(a: Association): HelpsRow | null {
  const c = associationCopy(a);
  if (!c || a.delta == null) return null;
  /* delta is the "more of it" group's pain minus the "less of it"
     group's: below zero, more went with lower pain */
  return {
    key: 'h.' + a.kind, side: a.delta < 0 ? 'better' : 'harder',
    text: c.body, why: c.sample + ' ' + c.timing, caveat: c.disclaimer,
  };
}

function doseRow(a: DoseAssociation): HelpsRow | null {
  if (a.verdict === 'observation') {
    return {
      key: 'd.' + a.medId, side: 'same', text: doseObservationCopy(a),
      why: a.pairs + ' doses with a check-in before and after.', caveat: DOSE_NON_CAUSATION,
    };
  }
  const c = doseCopy(a);
  if (!c || a.delta == null) return null;
  return {
    key: 'd.' + a.medId, side: a.delta < 0 ? 'better' : 'harder',
    text: c.body, why: c.sample + ' ' + c.timing, caveat: c.disclaimer,
  };
}

const ORDER: HelpsSide[] = ['better', 'harder', 'compared', 'doing', 'same'];

export interface HelpsInput {
  entries: Entries;
  todayIso: string;
  /** the running experiment, or the one that just ended and is still
   *  on the card */
  experiment: ExperimentState | null;
  /** experiments already put away, read as of their last day */
  past: ExperimentState[];
  /** Health comparisons whose groups formed (possible or observation) */
  health: Association[];
  /** dose comparisons whose pairs formed */
  doses: DoseAssociation[];
  /** the activity card's conclusions (capacity.ts), most useful first */
  activity: Insight[];
}

export function helpsView(input: HelpsInput): HelpsView {
  const rows: HelpsRow[] = [];
  input.past.forEach((s) => { const r = experimentRow(s); if (r) rows.push(r); });
  input.health.forEach((a) => { const r = healthRow(a); if (r) rows.push(r); });
  input.doses.forEach((a) => { const r = doseRow(a); if (r) rows.push(r); });
  const t = tiredComparison(input.entries, input.todayIso);
  if (t) rows.push(tiredRow(t));
  /* activity, as ONE row: the top conclusion, with what it rests on —
     the per-activity detail lives on Patterns now */
  const top = input.activity[0];
  if (top) {
    rows.push({
      key: 'a.' + top.key, side: 'doing', text: top.text, why: top.why,
      caveat: 'Read from your own sessions and the mornings after. Not medical advice.',
    });
  }
  /* stable: the side first, then the order each source already chose */
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (ORDER.indexOf(a.r.side) - ORDER.indexOf(b.r.side)) || (a.i - b.i))
    .map((x) => x.r);
  return {
    experiment: input.experiment,
    rows: sorted,
    more: Math.max(0, sorted.length - HELPS_TODAY_MAX),
    empty: !input.experiment && !sorted.length,
  };
}

/** the heading over each side, on the card and on Patterns */
export const SIDE_TITLES: Record<HelpsSide, string> = {
  better: 'Went with better days',
  harder: 'Went with harder days',
  compared: 'Compared',
  doing: 'What you can do',
  same: 'No difference found',
};

/** what the card says when nothing has cleared yet — what it is
 *  waiting for, never a verdict on the record */
export const HELPS_EMPTY =
  'Nothing stands out yet. Each comparison waits for enough days each way before it says '
  + 'anything — or pick one thing and find out in two weeks.';

/** the sentence the card carries about every row on it */
export const HELPS_NOTE =
  'Your own days compared with each other. A pattern, not proof of a cause, and not medical advice.';
