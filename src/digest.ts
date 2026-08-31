/**
 * The digest — what the record says, as sentences.
 *
 * The structure is Apple Health's Trends cards, deliberately: the
 * SENTENCE is the card, and the numbers underneath only back it up.
 * Pattern has computed these facts all along and led with the charts;
 * this file is the reading layer, not a new analysis — every sentence
 * here is derived from a statistic that already exists and already has
 * its gates argued in thresholds.ts.
 *
 * What was taken from Health's design, and what was refused:
 *  - taken: one fact per card, sentence first, evidence in small type.
 *  - refused: "today vs your average". For steps that is harmless; for
 *    pain it is a verdict on today, recomputed at every open — the
 *    checking loop this app exists to avoid. Every sentence here
 *    describes the RECORD, and none of them rates today.
 *  - refused: flames, arrows, trend glyphs. A card is words and grey
 *    numbers; colour stays reserved for pain values.
 *
 * The progress cards are the honest version of a reward: they count
 * toward ANSWERS, not scores. "Sleep is four answers from a
 * comparison" gives a check-in a visible purpose and changes only when
 * data changes — nothing here differs between two opens of the same
 * day except what the user added.
 *
 * Deterministic throughout, same discipline as daySummary: same data,
 * same words, pinned by tests, because a quiet rewording of a sentence
 * about someone's pain is a change to a medical description.
 */
import { Entries, Protocol } from './model';
import { formatScore } from './painScale';
import { FactorProgress, reviewProgress } from './protocol';
import { ReportData } from './report';
import { PATTERN_MIN_DELTA } from './thresholds';

/** points of mean pain between two day-parts before the digest calls
 *  one higher — the same bar every comparison in this app clears, for
 *  the same standard-error arithmetic (see thresholds.ts) */
export const DIGEST_BAND_MIN_DELTA = PATTERN_MIN_DELTA;

export interface DigestCard {
  key: string;
  /** the sentence — the card's whole point, plain words */
  title: string;
  /** the numbers behind it, smaller and grey */
  evidence: string;
  /** what it does not mean, when the sentence could be misread */
  caveat?: string;
}

/* ── what the record says ────────────────────────────────────
   Descriptive sentences only, each from an already-gated statistic in
   ReportData. No stat cleared its gate → no card → possibly no section
   at all. Silence is the correct output for a record that has not
   earned a sentence yet. */

export function recordSays(data: ReportData): DigestCard[] {
  const out: DigestCard[] = [];

  /* time of day — bands arrive pre-gated (BAND_MIN_CHECKINS across
     BAND_MIN_DAYS, empty on a limited record). The sentence needs the
     extremes to actually differ; below the delta the bands exist but
     have nothing to say, and saying it anyway would be noise read as
     news. */
  if (data.timeOfDay.length >= 2) {
    const sorted = data.timeOfDay.slice().sort((a, b) => a.avg - b.avg);
    const low = sorted[0], high = sorted[sorted.length - 1];
    if (high.avg - low.avg >= DIGEST_BAND_MIN_DELTA) {
      out.push({
        key: 'bands',
        title: 'Your ' + high.label.toLowerCase() + 's run higher than your '
          + low.label.toLowerCase() + 's.',
        evidence: high.label + ' average ' + formatScore(high.avg) + ' · '
          + low.label.toLowerCase() + ' average ' + formatScore(low.avg) + ' — '
          + (high.checkins + low.checkins) + ' check-ins across '
          + Math.max(high.days, low.days) + ' days.',
        caveat: 'A description of when you recorded more pain, not why.',
      });
    }
  }

  /* the hardest days, described — harderEasier arrives pre-gated
     (TERCILE_MIN_DAYS, TERCILE_MIN_SPREAD) and is already purely a
     description of what was recorded on each end */
  if (data.harderEasier) {
    const h = data.harderEasier.harder;
    const where = h.locations.length ? h.locations[0].name : null;
    const word = h.qualities.length ? h.qualities[0].name : null;
    if (where || word) {
      out.push({
        key: 'hardest',
        title: 'On your hardest days, you most often recorded '
          + (where && word ? where + ', and called it ' + word.toLowerCase()
            : (where || word)) + '.',
        evidence: 'Your hardest third — ' + h.days + ' days averaging '
          + formatScore(h.avg) + ' — against the rest of the record.',
        caveat: 'What those days looked like, not what made them hard.',
      });
    }
  }

  return out;
}

/* ── what a check-in is buying ───────────────────────────────
   Progress toward comparisons the user themselves set up — the active
   observation period's factors, counted by the same reviewProgress the
   day-14 review reads. Only factors still short of comparable appear:
   a finished count is the engine's business, not a card. */

/** the sentence for one factor still collecting. null once comparable —
 *  there is nothing to look forward to that the engine will not say. */
export function progressCard(f: FactorProgress): DigestCard | null {
  if (f.comparable) return null;
  const shortLow = Math.max(0, f.needed - f.lowCount);
  const shortHigh = Math.max(0, f.needed - f.highCount);
  const remaining = Math.max(shortLow, shortHigh);
  /* the factor is the headline and the mechanics are the small print —
     "Sleep / not enough data yet / 3 more poor days needed" reads as
     learning about yourself; "about 5 answers from a comparison" read
     as feeding an algorithm */
  const need: string[] = [];
  if (shortLow > 0) need.push(shortLow + ' more ' + f.lowLabel.toLowerCase()
    + ' ' + (shortLow === 1 ? 'day' : 'days'));
  if (shortHigh > 0) need.push(shortHigh + ' more ' + f.highLabel.toLowerCase()
    + ' ' + (shortHigh === 1 ? 'day' : 'days'));
  return {
    key: 'progress.' + f.metricId,
    title: f.name,
    evidence: (remaining <= 2 ? 'Almost comparable — ' : 'Not enough data yet — ')
      + need.join(' and ') + ' needed.',
    caveat: 'So far: ' + f.lowCount + ' ' + f.lowLabel.toLowerCase() + ', '
      + f.highCount + ' ' + f.highLabel.toLowerCase()
      + '. Pattern needs around ' + f.needed + ' of each.',
  };
}

export function checkinBuys(
  protocol: Protocol | null, entries: Entries, todayIso: string
): DigestCard[] {
  if (!protocol || protocol.status !== 'active') return [];
  return reviewProgress(protocol, entries, todayIso)
    .factors
    .map(progressCard)
    .filter((c): c is DigestCard => c != null);
}
