/**
 * The metric registry — every question Pattern can ask, described once.
 *
 * Broad underneath, narrow for the user. This file holds the whole
 * library; an observation protocol activates two of it; the check-in
 * shows two. Screens, the report, the backup and the analysis all read
 * their definition of a question from here, so wording, scale and
 * eligibility cannot drift between the place a thing is asked and the
 * place it is explained.
 *
 * Three rules the registry exists to enforce:
 *
 *  - A question has a STABLE ID. Displayed text may change; the id may
 *    not. Answers are stored against the id, never the words.
 *  - Changing the words bumps `wordingVersion`, and answers captured
 *    under different wording versions are NEVER pooled in an analysis.
 *    Two people answering "how stressed do you feel" and "how much
 *    stress today" are not answering the same question.
 *  - An ordinal factor declares its EXTREMES. Analysis compares only the
 *    ends and discards the middle, which holds the comparison count at
 *    two per factor instead of nine.
 *
 * The time bands live here too, and report.ts reads them from here.
 * There is one definition of "morning" in this app.
 */

/* ── time bands ──────────────────────────────────────────────
   Night wraps midnight deliberately: pain that wakes you belongs with
   pain at 23:00, not with the morning. */

export type TimeBandKey = 'morning' | 'afternoon' | 'evening' | 'night';

export const BANDS: { key: TimeBandKey; label: string; range: string }[] = [
  { key: 'morning', label: 'Morning', range: '05:00–11:59' },
  { key: 'afternoon', label: 'Afternoon', range: '12:00–16:59' },
  { key: 'evening', label: 'Evening', range: '17:00–21:59' },
  { key: 'night', label: 'Night', range: '22:00–04:59' },
];

/** which part of the day a minute-of-day belongs to */
export function bandOf(h: number): TimeBandKey {
  if (h >= 5 * 60 && h < 12 * 60) return 'morning';
  if (h >= 12 * 60 && h < 17 * 60) return 'afternoon';
  if (h >= 17 * 60 && h < 22 * 60) return 'evening';
  return 'night';
}

/** the evening window a same-day question may be asked in. Logs after
 *  midnight carry the FOLLOWING local date, so "how demanding has today
 *  been" would be asking about the wrong day. */
export const EVENING_ASK_FROM = 17 * 60;
export const EVENING_ASK_UNTIL = 24 * 60 - 1;

/* ── eligibility ─────────────────────────────────────────────
   When a question may honestly be asked. Rated at 21:00, "how was your
   sleep last night" is a recall made after a full day of pain — the
   answer is contaminated by the outcome it is meant to predict. A
   question outside its window is NOT ASKED, and the day carries no value
   for it. Missing, never guessed. */

export type Eligibility =
  | 'firstOfDay'          // first check-in of the local day, any time
  | 'firstOfDayMorning'   // first check-in of the local day, and it is morning
  | 'firstAfter1700'      // first check-in from 17:00 to 23:59
  | 'everyMoment'
  | 'onceAtProtocolStart';

/** does this moment satisfy an eligibility rule?
 *  `firstOfDay` means no earlier moment exists today; `alreadyAnswered`
 *  covers the day-scoped questions that must not be asked twice. */
export function eligibleNow(
  rule: Eligibility | undefined,
  h: number,
  isFirstOfDay: boolean,
  alreadyAnswered: boolean
): boolean {
  if (!rule) return false;
  if (rule === 'everyMoment') return true;
  if (rule === 'onceAtProtocolStart') return false; // asked by the protocol flow, not the check-in
  if (alreadyAnswered) return false;
  if (rule === 'firstOfDay') return isFirstOfDay;
  if (rule === 'firstOfDayMorning') return isFirstOfDay && bandOf(h) === 'morning';
  if (rule === 'firstAfter1700') return h >= EVENING_ASK_FROM && h <= EVENING_ASK_UNTIL;
  return false;
}

/* ── the registry ───────────────────────────────────────────── */

export type MetricType = 'ordinal' | 'numeric' | 'set';
export type MetricScope = 'moment' | 'day' | 'week' | 'protocol';
export type AnalysisRule = 'compareExtremes' | 'trend' | 'frequency' | 'none';

export interface MetricLevel {
  id: string;
  label: string;
}

export interface MetricDef {
  /** stable storage key. Never reused, never renamed. */
  id: string;
  /** short name for lists and the report */
  name: string;
  /** the question as the user reads it */
  question: string;
  type: MetricType;
  scope: MetricScope;
  /** ordinal only, ordered low → high */
  levels?: MetricLevel[];
  /** ordinal only: the ONLY pair an analysis ever compares */
  extremes?: [string, string];
  /** numeric only */
  range?: [number, number];
  /** numeric only: what the ends mean */
  ends?: [string, string];
  /** set only: which vocabulary the ids come from */
  vocabulary?: 'body' | 'quality' | 'modifiers' | 'impact';
  /** bump when the words change; answers across versions never pool */
  wordingVersion: number;
  eligibility?: Eligibility;
  analysis: AnalysisRule;
  /** may a protocol activate this as one of its two factors? */
  protocolEligible: boolean;
  /** lowercase substrings the local hypothesis matcher looks for */
  keywords?: string[];
  /** why a factor is not protocol-eligible — shown to the user rather
   *  than silently offering a worse proxy */
  excludedBecause?: string;
}

const lv = (id: string, label: string): MetricLevel => ({ id, label });

const IMPACT_WORSE_ID = 'impact.worse.v1';
const IMPACT_BETTER_ID = 'impact.better.v1';

export const METRICS: MetricDef[] = [
  /* ── fixed core: always on, never part of a protocol ──────── */
  {
    id: 'pain.intensity.v3',
    name: 'Pain',
    question: 'How is your pain right now?',
    type: 'numeric', scope: 'moment', range: [0, 10], ends: ['No pain', 'Most intense'],
    wordingVersion: 1, eligibility: 'everyMoment', analysis: 'trend',
    protocolEligible: false,
  },
  {
    id: 'pain.interference.v1',
    name: 'Interference',
    question: 'How much is pain getting in the way right now?',
    type: 'numeric', scope: 'day', range: [0, 10], ends: ['Not at all', 'Completely'],
    wordingVersion: 1, eligibility: 'firstOfDay', analysis: 'trend',
    protocolEligible: false,
  },
  {
    id: 'body.areas.v1',
    name: 'Body areas',
    question: 'Where in your body?',
    type: 'set', scope: 'moment', vocabulary: 'body',
    wordingVersion: 1, eligibility: 'everyMoment', analysis: 'frequency',
    protocolEligible: false,
  },
  {
    id: 'pain.quality.v1',
    name: 'Described as',
    question: 'How does it feel?',
    type: 'set', scope: 'moment', vocabulary: 'quality',
    wordingVersion: 1, eligibility: 'everyMoment', analysis: 'frequency',
    protocolEligible: false,
  },
  {
    id: 'pain.modifiers.v1',
    name: 'Better or worse with',
    question: 'What tends to change it?',
    type: 'set', scope: 'protocol', vocabulary: 'modifiers',
    wordingVersion: 1, eligibility: 'onceAtProtocolStart', analysis: 'frequency',
    protocolEligible: false,
  },
  {
    id: IMPACT_WORSE_ID,
    name: 'Made it harder',
    question: 'What made it harder today?',
    type: 'set', scope: 'day', vocabulary: 'impact',
    wordingVersion: 1, eligibility: 'firstOfDay', analysis: 'frequency',
    protocolEligible: false,
  },
  {
    id: IMPACT_BETTER_ID,
    name: 'Helped',
    question: 'What helped today?',
    type: 'set', scope: 'day', vocabulary: 'impact',
    wordingVersion: 1, eligibility: 'firstOfDay', analysis: 'frequency',
    protocolEligible: false,
  },
  {
    id: 'function.ability.v1',
    name: 'Ability',
    question: 'How able were you to do this activity this week?',
    type: 'numeric', scope: 'week', range: [0, 10], ends: ['Not able at all', 'Fully able'],
    wordingVersion: 1, analysis: 'trend',
    protocolEligible: false,
  },

  /* ── protocol-eligible factors ────────────────────────────── */
  {
    id: 'stress.level.v1',
    name: 'Stress',
    question: 'How stressed do you feel right now?',
    type: 'ordinal', scope: 'day',
    levels: [lv('low', 'Low'), lv('medium', 'Medium'), lv('high', 'High')],
    extremes: ['low', 'high'],
    wordingVersion: 1, eligibility: 'firstOfDay', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['stress', 'stressed', 'anxiety', 'anxious', 'tension', 'worry', 'pressure'],
  },
  {
    id: 'sleep.quality.v1',
    name: 'Sleep',
    question: 'How was your sleep last night?',
    type: 'ordinal', scope: 'day',
    levels: [lv('poor', 'Poor'), lv('okay', 'Okay'), lv('good', 'Good')],
    extremes: ['poor', 'good'],
    wordingVersion: 1, eligibility: 'firstOfDayMorning', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['sleep', 'slept', 'insomnia', 'rest at night', 'night', 'tired in the morning'],
  },
  {
    id: 'fatigue.level.v1',
    name: 'Fatigue',
    question: 'How tired do you feel right now?',
    type: 'ordinal', scope: 'day',
    levels: [lv('low', 'Low'), lv('medium', 'Medium'), lv('high', 'High')],
    extremes: ['low', 'high'],
    wordingVersion: 1, eligibility: 'firstOfDay', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['fatigue', 'tired', 'exhausted', 'exhaustion', 'energy', 'drained'],
  },
  {
    id: 'stiffness.level.v1',
    name: 'Stiffness',
    question: 'How stiff do you feel this morning?',
    type: 'ordinal', scope: 'day',
    levels: [lv('none', 'None'), lv('some', 'Some'), lv('marked', 'A lot')],
    extremes: ['none', 'marked'],
    wordingVersion: 1, eligibility: 'firstOfDayMorning', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['stiff', 'stiffness', 'seized', 'locked up', 'morning stiffness'],
  },
  {
    id: 'load.physical.v1',
    name: 'Physical load',
    question: 'Compared with usual, how physically demanding has today been?',
    type: 'ordinal', scope: 'day',
    levels: [lv('less', 'Less'), lv('usual', 'Usual'), lv('more', 'More')],
    extremes: ['less', 'more'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['load', 'demanding', 'exertion', 'overdo', 'overdid', 'push', 'busy day', 'work'],
  },
  {
    id: 'movement.amount.v1',
    name: 'Movement',
    question: 'Compared with usual, how much did you move today?',
    type: 'ordinal', scope: 'day',
    levels: [lv('less', 'Less'), lv('usual', 'Usual'), lv('more', 'More')],
    extremes: ['less', 'more'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['movement', 'moving', 'walk', 'walking', 'exercise', 'sitting', 'sedentary', 'active'],
  },
  {
    id: 'lifting.carrying.v1',
    name: 'Lifting or carrying',
    question: 'Did you lift or carry anything heavy today?',
    type: 'ordinal', scope: 'day',
    levels: [lv('none', 'None'), lv('some', 'Some'), lv('alot', 'A lot')],
    extremes: ['none', 'alot'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['lift', 'lifting', 'carry', 'carrying', 'heavy', 'bags', 'shopping'],
  },
  {
    id: 'weather.felt.v1',
    name: 'Weather',
    question: 'Compared with usual, how did the weather feel today?',
    type: 'ordinal', scope: 'day',
    levels: [lv('colder', 'Colder'), lv('usual', 'Usual'), lv('warmer', 'Warmer')],
    extremes: ['colder', 'warmer'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['weather', 'cold', 'damp', 'humid', 'rain', 'heat', 'hot', 'temperature', 'pressure front'],
  },
  {
    id: 'alcohol.intake.v1',
    name: 'Alcohol',
    question: 'Did you drink alcohol today?',
    type: 'ordinal', scope: 'day',
    levels: [lv('none', 'None'), lv('some', 'Some'), lv('more', 'More than usual')],
    extremes: ['none', 'more'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['alcohol', 'drink', 'drinking', 'wine', 'beer'],
  },
  {
    id: 'recovery.practice.v1',
    name: 'Recovery',
    question: 'Did you do anything today to look after yourself?',
    type: 'ordinal', scope: 'day',
    levels: [lv('none', 'None'), lv('some', 'Some'), lv('focused', 'A focused effort')],
    extremes: ['none', 'focused'],
    wordingVersion: 1, eligibility: 'firstAfter1700', analysis: 'compareExtremes',
    protocolEligible: true,
    keywords: ['recovery', 'self-care', 'stretch', 'stretching', 'relax', 'breathing', 'bath', 'heat pad'],
  },

  /* ── deliberately NOT protocol-eligible ───────────────────────
     Named here rather than left out, so a user whose hypothesis lands on
     one of these can be told honestly that Pattern cannot examine it yet
     — instead of being handed a three-level proxy that would produce a
     confident answer to a question it never asked. */
  {
    id: 'cycle.phase.v1',
    name: 'Menstrual or hormonal cycle',
    question: 'Where are you in your cycle?',
    type: 'ordinal', scope: 'day', wordingVersion: 1, analysis: 'none',
    protocolEligible: false,
    keywords: ['period', 'menstrual', 'cycle', 'hormonal', 'hormones', 'pms', 'ovulation'],
    excludedBecause:
      'A cycle is a phase, not a low-to-high scale, and a comparison needs several months ' +
      'rather than several weeks. Pattern would rather say nothing than force it into three levels.',
  },
  {
    id: 'food.intake.v1',
    name: 'Food',
    question: 'How did you eat today?',
    type: 'ordinal', scope: 'day', wordingVersion: 1, analysis: 'none',
    protocolEligible: false,
    keywords: ['food', 'diet', 'eating', 'gluten', 'sugar', 'dairy', 'inflammation'],
    excludedBecause:
      'A single food question covers too much to measure anything. Tracking one specific ' +
      'thing you suspect is the useful version, and that is not built yet.',
  },
  {
    id: 'medication.change.v1',
    name: 'Medication',
    question: 'Did your medication change?',
    type: 'ordinal', scope: 'day', wordingVersion: 1, analysis: 'none',
    protocolEligible: false,
    keywords: ['medication', 'meds', 'tablets', 'painkillers', 'dose', 'dosage'],
    excludedBecause:
      'Medication is recorded as an event so it appears in your report, but Pattern never ' +
      'analyses it for cause and never comments on a dose.',
  },
];

/* ── what you flagged ────────────────────────────────────────
   The chips. Old ids are kept where an old id existed, so anything
   recorded in the web app still lines up; the rest are new.

   `promotesTo` is the whole point of the list. A chip that names
   something Pattern can measure properly carries a pointer to the metric
   that measures it, and enough flags turn into an offer to start asking
   the real question. A chip with no pointer is still worth recording —
   work, driving, screen time, family are real answers to "what made this
   day harder" — it just never becomes a test.

   MEDICATION is deliberately pointer-less and always will be. It is
   recordable because leaving it out would make the record dishonest, and
   it is never analysed because Pattern does not comment on medication. */

export interface ImpactChip {
  id: string;
  name: string;
  /** the metric that could measure this properly, if there is one */
  promotesTo?: string;
}

export const IMPACT_CHIPS: ImpactChip[] = [
  { id: 'sleep', name: 'Sleep', promotesTo: 'sleep.quality.v1' },
  { id: 'stress', name: 'Stress', promotesTo: 'stress.level.v1' },
  { id: 'fatigue', name: 'Fatigue', promotesTo: 'fatigue.level.v1' },
  { id: 'stiffness', name: 'Stiffness', promotesTo: 'stiffness.level.v1' },
  { id: 'activity', name: 'Physical activity', promotesTo: 'load.physical.v1' },
  { id: 'lifting', name: 'Lifting or carrying', promotesTo: 'lifting.carrying.v1' },
  { id: 'weather', name: 'Weather', promotesTo: 'weather.felt.v1' },
  { id: 'rest', name: 'Rest or self-care', promotesTo: 'recovery.practice.v1' },
  { id: 'alcohol', name: 'Alcohol', promotesTo: 'alcohol.intake.v1' },
  { id: 'sitting', name: 'Long sitting' },
  { id: 'work', name: 'Work' },
  { id: 'driving', name: 'Driving' },
  { id: 'screens', name: 'Screen time' },
  { id: 'family', name: 'Family' },
  { id: 'food', name: 'Food' },
  { id: 'meds', name: 'Medication' },
];

export const IMPACT_IDS = IMPACT_CHIPS.map((c) => c.id);

const IMPACT_BY_ID: Record<string, ImpactChip> = {};
IMPACT_CHIPS.forEach((c) => { IMPACT_BY_ID[c.id] = c; });

export function impactChip(id: string): ImpactChip | null {
  return IMPACT_BY_ID[id] || null;
}
export function impactName(id: string): string {
  const c = IMPACT_BY_ID[id];
  return c ? c.name : id;
}

export const IMPACT_WORSE = 'impact.worse.v1';
export const IMPACT_BETTER = 'impact.better.v1';

/* ── the modifier vocabulary (asked once, not daily) ────────── */

export const MODIFIER_NAMES: Record<string, string> = {
  moveBetter: 'Better with movement', moveWorse: 'Worse with movement',
  restBetter: 'Better with rest', restWorse: 'Worse with rest',
  heatBetter: 'Better with heat', coldBetter: 'Better with cold',
  pressureBetter: 'Better with pressure', pressureWorse: 'Worse with pressure',
};
export const MODIFIERIDS = Object.keys(MODIFIER_NAMES);

/* ── lookups ─────────────────────────────────────────────────── */

const BYID: Record<string, MetricDef> = {};
METRICS.forEach((m) => { BYID[m.id] = m; });

export function getMetric(id: string): MetricDef | null {
  return BYID[id] || null;
}

export function isKnownMetric(id: string): boolean {
  return !!BYID[id];
}

/** the factors a protocol may activate, in library order */
export function protocolFactors(): MetricDef[] {
  return METRICS.filter((m) => m.protocolEligible);
}

/** a level's display label, or the raw id if the vocabulary moved on */
export function levelLabel(metricId: string, levelId: string): string {
  const m = BYID[metricId];
  if (!m || !m.levels) return levelId;
  const l = m.levels.filter((x) => x.id === levelId)[0];
  return l ? l.label : levelId;
}

/** is this a value the metric could actually have produced? Used when
 *  cleaning untrusted input — a backup, an older build, a hand edit. */
/** is this metric stored as a list of ids rather than one value? */
export function isSetMetric(metricId: string): boolean {
  const m = BYID[metricId];
  return !!m && m.type === 'set';
}

/** is this id part of that set metric's vocabulary? Unknown ids are
 *  dropped on the way in rather than stored and puzzled over later. */
export function validSetMember(metricId: string, id: string): boolean {
  const m = BYID[metricId];
  if (!m || m.type !== 'set') return false;
  if (m.vocabulary === 'impact') return IMPACT_IDS.indexOf(id) >= 0;
  if (m.vocabulary === 'modifiers') return MODIFIERIDS.indexOf(id) >= 0;
  return true;   // body areas and quality words are cleaned by model.ts
}

export function validAnswerValue(metricId: string, value: unknown): boolean {
  const m = BYID[metricId];
  if (!m) return false;
  if (m.type === 'ordinal') {
    if (typeof value !== 'string' || !m.levels) return false;
    return m.levels.some((l) => l.id === value);
  }
  if (m.type === 'numeric') {
    if (typeof value !== 'number' || !isFinite(value)) return false;
    const [lo, hi] = m.range || [0, 10];
    return value >= lo && value <= hi;
  }
  return false; // sets are stored on the moment, not as a scalar answer
}

/* ── the local hypothesis matcher ─────────────────────────────
   A lookup table, not a model. It runs on the device, sends nothing
   anywhere, and is wrong in ways a person can see and correct on the
   confirmation screen — which is the point. The user's own words are
   never parsed for meaning by anything remote, because a sentence about
   your own pain is health data and this app's privacy answer has to stay
   literally true. */

/** protocol-eligible factors whose keywords appear in the text, strongest
 *  match first. Case-insensitive, substring, deliberately simple. */
export function matchFactors(text: string): MetricDef[] {
  const hay = (text || '').toLowerCase();
  if (!hay.trim()) return [];
  const scored: { m: MetricDef; n: number }[] = [];
  METRICS.forEach((m) => {
    if (!m.keywords) return;
    let n = 0;
    m.keywords.forEach((k) => { if (hay.indexOf(k) >= 0) n++; });
    if (n > 0) scored.push({ m, n });
  });
  scored.sort((a, b) => (b.n !== a.n ? b.n - a.n : METRICS.indexOf(a.m) - METRICS.indexOf(b.m)));
  return scored.map((s) => s.m);
}

/** matches that Pattern cannot currently track, so the setup flow can say
 *  so plainly instead of quietly offering something else */
export function matchedExclusions(text: string): MetricDef[] {
  return matchFactors(text).filter((m) => !m.protocolEligible && !!m.excludedBecause);
}
