/**
 * Observation protocols — deciding what to ask, when, and what to say
 * about how it is going.
 *
 * model.ts owns the shapes and the cleaning; this file owns the
 * decisions. Everything here is pure: entries and a protocol in, an
 * answer out. No storage, no React Native, no clock of its own — the
 * caller passes today's date, so a test can be any day it likes.
 *
 * The one rule worth stating twice: what this file reports at a review
 * point is COMPLETENESS, never content. How many observations exist, and
 * how many a comparison would need. Not what those observations say.
 * A count of pain-by-factor at fifteen days is an invitation to conclude
 * something the sample cannot support, and no amount of hedging copy
 * undoes a number on a screen.
 */
import {
  IMPACT_BETTER, IMPACT_WORSE, MetricDef, eligibleNow, getMetric, impactChip,
  protocolFactors,
} from './metrics';
import {
  Answer, Entries, Entry, Protocol, addDays, answerOf, dateFromISO, iso, logsOf,
  valuesOf,
} from './model';
import {
  IMPACT_PROMOTE_MIN, IMPACT_PROMOTE_WINDOW, PATTERN_MIN_N, PROTOCOL_REVIEW_DAYS,
} from './thresholds';

/* ── choosing the second factor ──────────────────────────────
   Deterministic, so a test can prove it and a user gets the same answer
   twice. Not random: randomness here would be untestable and would buy
   nothing a rotation does not.

   It exists because a protocol tracking only what the user already
   suspects can confirm but never discover — and because the same person
   rates the factor and the pain, at the same moment, holding a stated
   theory about how they relate. One factor nobody nominated is the
   cheapest available check on that. */

export interface SecondFactorPick {
  factor: MetricDef;
  /** how the rotation should advance for the next protocol */
  nextRotation: number;
}

/**
 * @param chosenId    the factor the user picked
 * @param matchedIds  factors their own words pointed at — all excluded,
 *                    not just the one they chose: a factor they named and
 *                    passed over is still one they believe in
 * @param previousId  the second factor of the protocol before this one
 * @param rotation    a counter kept in preferences, so consecutive
 *                    protocols do not keep landing on the same factor
 */
export function pickSecondFactor(
  chosenId: string,
  matchedIds: string[],
  previousId: string | null,
  rotation: number
): SecondFactorPick | null {
  const all = protocolFactors();
  const blocked: Record<string, true> = {};
  blocked[chosenId] = true;
  matchedIds.forEach((id) => { blocked[id] = true; });
  if (previousId) blocked[previousId] = true;

  let pool = all.filter((m) => !blocked[m.id]);
  // everything is blocked only for a user who named the whole library;
  // then the previous protocol's factor is the one worth reusing last
  if (!pool.length) pool = all.filter((m) => m.id !== chosenId);
  if (!pool.length) return null;

  const start = ((rotation % pool.length) + pool.length) % pool.length;
  return { factor: pool[start], nextRotation: rotation + 1 };
}

/* ── the shape of an active period ──────────────────────────── */

export function reviewDateFor(startIso: string): string {
  return addDays(startIso, PROTOCOL_REVIEW_DAYS - 1);
}

export function activeFactorIds(p: Protocol | null): string[] {
  return p ? [p.chosenFactor, p.secondFactor] : [];
}

export function activeFactors(p: Protocol | null): MetricDef[] {
  return activeFactorIds(p)
    .map((id) => getMetric(id))
    .filter((m): m is MetricDef => m != null);
}

/** which day of the period today is, 1-based. 0 = not started yet. */
export function dayNumber(p: Protocol, todayIso: string): number {
  const a = dateFromISO(p.startDate).getTime();
  const b = dateFromISO(todayIso).getTime();
  const n = Math.round((b - a) / 86400000) + 1;
  return n > 0 ? n : 0;
}

export function reviewDue(p: Protocol, todayIso: string): boolean {
  return p.status === 'active' && todayIso >= p.reviewOn;
}

/* ── what to ask, right now ──────────────────────────────────
   A question outside its window is not asked, and the day carries no
   value for it. That is the whole point of the windows: "how was your
   sleep last night", answered at nine in the evening, is a recall made
   after a full day of pain — the rating is shaped by the outcome it is
   supposed to help explain. Better a gap than a number that means the
   opposite of what it appears to. */

export interface AskContext {
  /** minutes since local midnight for the moment being logged */
  h: number;
  /** is this the first moment recorded on this local day? */
  isFirstOfDay: boolean;
  /** the day being written, as it stands */
  entry: Entry | null;
}

/** the day-scoped metric ids this moment may ask, in library order */
export function questionsNow(
  p: Protocol | null,
  ctx: AskContext,
  extraIds: string[] = []
): string[] {
  const ids = activeFactorIds(p).concat(extraIds);
  const seen: Record<string, true> = {};
  const out: string[] = [];
  ids.forEach((id) => {
    if (seen[id]) return;
    seen[id] = true;
    const m = getMetric(id);
    if (!m) return;
    const already = answerOf(ctx.entry, id) != null;
    if (eligibleNow(m.eligibility, ctx.h, ctx.isFirstOfDay, already)) out.push(id);
  });
  return out;
}

/** Evening-eligible questions still unanswered today, for the
 *  one-question follow-up. Without this a morning-only logger never
 *  records physical load at all: their first check-in is out of the
 *  window, and nothing else ever offers it. */
export function eveningFollowUps(p: Protocol | null, ctx: AskContext): string[] {
  return activeFactorIds(p).filter((id) => {
    const m = getMetric(id);
    if (!m || m.eligibility !== 'firstAfter1700') return false;
    if (answerOf(ctx.entry, id) != null) return false;
    return eligibleNow(m.eligibility, ctx.h, ctx.isFirstOfDay, false);
  });
}

/** A factor the user can never answer, because they never log inside its
 *  window. Worth saying out loud rather than quietly collecting nothing:
 *  "sleep is asked in the morning, and you haven't had a morning
 *  check-in this week" is actionable; an empty chart is not. */
export function unreachableFactors(
  p: Protocol | null, entries: Entries, todayIso: string, lookback = 7
): string[] {
  if (!p) return [];
  return activeFactorIds(p).filter((id) => {
    const m = getMetric(id);
    if (!m || !m.eligibility) return false;
    if (m.eligibility === 'everyMoment' || m.eligibility === 'onceAtProtocolStart') return false;
    for (let back = 0; back < lookback; back++) {
      const d = dateFromISO(todayIso);
      d.setDate(d.getDate() - back);
      const key = iso(d);
      const e = entries[key];
      if (!e) continue;
      if (answerOf(e, id) != null) return false;
      const logs = logsOf(e);
      for (let i = 0; i < logs.length; i++) {
        if (eligibleNow(m.eligibility, logs[i].h, i === 0, false)) return false;
      }
    }
    return true;
  });
}

/* ── the review: how much, never what ───────────────────────── */

export interface FactorProgress {
  metricId: string;
  name: string;
  /** days carrying a real value (a skip is not one) */
  answered: number;
  /** days the question was put and declined */
  skipped: number;
  /** observations at each extreme — the groups a comparison would use */
  lowId: string; lowLabel: string; lowCount: number;
  highId: string; highLabel: string; highCount: number;
  /** how many each group needs before any comparison is possible */
  needed: number;
  /** both groups are large enough for the engine to have something to
   *  look at. NOT a statement that it found anything. */
  comparable: boolean;
}

export interface ReviewProgress {
  dayNumber: number;
  totalDays: number;
  loggedDays: number;
  factors: FactorProgress[];
  /** factors whose window the user never logs inside */
  unreachable: string[];
}

function countExtremes(
  entries: Entries, from: string, to: string, m: MetricDef
): { answered: number; skipped: number; low: number; high: number } {
  let answered = 0, skipped = 0, low = 0, high = 0;
  const [lowId, highId] = m.extremes || ['', ''];
  Object.keys(entries).forEach((k) => {
    if (k < from || k > to) return;
    const a: Answer | null = answerOf(entries[k], m.id);
    if (!a) return;                       // never asked — not a skip
    if (a.skipped === 1) { skipped++; return; }
    answered++;
    if (a.value === lowId) low++;
    else if (a.value === highId) high++;
  });
  return { answered, skipped, low, high };
}

/**
 * What the review point may say. Group sizes and what a comparison would
 * need — nothing about pain, and nothing that lets a reader do the
 * arithmetic the threshold exists to prevent.
 */
export function reviewProgress(
  p: Protocol, entries: Entries, todayIso: string
): ReviewProgress {
  const from = p.startDate;
  const to = p.endDate && p.endDate < todayIso ? p.endDate : todayIso;

  let loggedDays = 0;
  Object.keys(entries).forEach((k) => { if (k >= from && k <= to) loggedDays++; });

  const factors: FactorProgress[] = activeFactors(p).map((m) => {
    const c = countExtremes(entries, from, to, m);
    const [lowId, highId] = m.extremes || ['', ''];
    const levels = m.levels || [];
    const lab = (id: string) => {
      const l = levels.filter((x) => x.id === id)[0];
      return l ? l.label : id;
    };
    return {
      metricId: m.id, name: m.name,
      answered: c.answered, skipped: c.skipped,
      lowId, lowLabel: lab(lowId), lowCount: c.low,
      highId, highLabel: lab(highId), highCount: c.high,
      needed: PATTERN_MIN_N,
      comparable: c.low >= PATTERN_MIN_N && c.high >= PATTERN_MIN_N,
    };
  });

  return {
    dayNumber: dayNumber(p, todayIso),
    totalDays: PROTOCOL_REVIEW_DAYS,
    loggedDays,
    factors,
    unreachable: unreachableFactors(p, entries, todayIso),
  };
}

/* ── from flags to a question ────────────────────────────────
   Counting how often something was blamed, and turning that into an offer
   to measure it properly.

   The count is NOT a finding and must never be shown as one. "You flagged
   sleep nine times" says nine times you thought sleep was the problem; it
   says nothing about whether it was, because there is no set of days you
   thought sleep was fine to compare it against. What the count is good
   for is choosing what to spend the next fourteen days actually asking. */

export interface Promotion {
  /** the chip that keeps coming up */
  chipId: string;
  chipName: string;
  /** the metric that could measure it properly */
  metricId: string;
  metricName: string;
  /** how many days it was flagged, in the window */
  flags: number;
  /** which side it was flagged on, for the wording */
  side: 'worse' | 'better';
}

/** the strongest promotable chip, or null. Anything already being asked
 *  about is skipped: offering to test what is already being tested is
 *  noise. */
export function promotionCandidate(
  entries: Entries, todayIso: string, activeIds: string[]
): Promotion | null {
  const from = addDays(todayIso, -(IMPACT_PROMOTE_WINDOW - 1));
  const counts: Record<string, { worse: number; better: number }> = {};

  Object.keys(entries).forEach((k) => {
    if (k < from || k > todayIso) return;
    ([IMPACT_WORSE, IMPACT_BETTER] as const).forEach((mid) => {
      const ids = valuesOf(entries[k], mid);
      if (!ids) return;
      ids.forEach((id) => {
        const c = counts[id] || (counts[id] = { worse: 0, better: 0 });
        if (mid === IMPACT_WORSE) c.worse++; else c.better++;
      });
    });
  });

  let best: Promotion | null = null;
  Object.keys(counts).forEach((chipId) => {
    const chip = impactChip(chipId);
    if (!chip || !chip.promotesTo) return;                 // nothing to measure it with
    if (activeIds.indexOf(chip.promotesTo) >= 0) return;   // already being asked
    const m = getMetric(chip.promotesTo);
    if (!m) return;
    const c = counts[chipId];
    const side: 'worse' | 'better' = c.worse >= c.better ? 'worse' : 'better';
    const flags = Math.max(c.worse, c.better);
    if (flags < IMPACT_PROMOTE_MIN) return;
    if (best && best.flags >= flags) return;
    best = {
      chipId, chipName: chip.name, metricId: m.id, metricName: m.name, flags, side,
    };
  });
  return best;
}

/* ── copy ────────────────────────────────────────────────────
   Fixed sentences. Free-text activity names taught this codebase once
   already that interpolating a user's words into a sentence produces
   "How able have you felt to running?" — factor NAMES are ours and are
   safe, but the hypothesis text never appears inside a sentence. */

export const PROTOCOL_CONFIRM_TITLE = 'Your focus for the next 14 days';
export const PROTOCOL_CONFIRM_BODY =
  'We’ll keep your questions consistent so you can see whether a pattern develops.';
export const PROTOCOL_CHOSEN_NOTE = 'the one you chose';
export const PROTOCOL_SECOND_NOTE = 'one more, so there’s something to compare against';

/* "your focus", everywhere a person reads it — the sheet, the card, the
   Profile row. "Observation period" is what it is called in the spec
   and the PDF, and one thing with two names in the same app is a
   thing the user has to translate. */
export const REVIEW_TITLE = 'Day 14 of your focus';

/** "You've flagged sleep on 9 days." — a count of what you thought, said
 *  as a count of what you thought. */
export function promotionSentence(pr: Promotion): string {
  return 'You’ve pointed at ' + pr.chipName.toLowerCase() + ' on ' + pr.flags
    + ' days. Pattern can start asking about it properly, so there’s something'
    + ' to compare those days against.';
}
export const REVIEW_KEEP = 'Keep observing';
export const REVIEW_CHANGE = 'Change my focus';

/** "You have 5 and 4 so far." — group sizes only. */
export function progressSentence(f: FactorProgress): string {
  return 'To compare your ' + f.highLabel.toLowerCase() + ' days against your '
    + f.lowLabel.toLowerCase() + ' ones, Pattern needs about ' + f.needed
    + ' of each. You have ' + f.highCount + ' and ' + f.lowCount + ' so far.';
}
