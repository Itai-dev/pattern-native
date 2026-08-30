/**
 * Pattern domain model — pure logic, no React Native and no storage.
 * Ported from the shipped PWA (app/index.html) with every invariant the
 * 2026-08-19 review hardened. db.ts persists it; screens render it.
 *
 * The data rules, in one place:
 *  - a day's `pain` is the PEAK of its moments, never the latest;
 *  - a legacy day value ABOVE its own moments' peak (data from before
 *    timestamps) is evidence and survives every re-write;
 *  - `factors` is tri-state: undefined = never asked, [] = asked and
 *    none chosen — the empty array must survive import and migration;
 *  - unknown tag ids are dropped, never stored;
 *  - removing a day's only moment removes the day, unless SOMETHING
 *    anchors it — a note, a context answer, anything the user put there.
 *
 * Three states, never two. For every optional answer, "never asked",
 * "asked and skipped" and "answered" are distinguishable and stay that
 * way through storage, backup and migration. A skipped answer is never
 * read as a negative one, and a question that was never in front of the
 * user is never counted as a question they declined.
 *
 * Pain values are integers 0–10 everywhere. The labels and formatting for
 * them live in painScale.ts, which is the single definition of the scale.
 */
import {
  isKnownMetric, isSetMetric, validAnswerValue, validSetMember, MODIFIERIDS,
} from './metrics';
import { formatScore, normalizePain, painLabel } from './painScale';
import { DAY_SHAPE_MIN_DELTA } from './thresholds';

export interface Moment {
  /** minutes since LOCAL midnight, 0–1439 — the identity of a moment and
   *  the key every screen renders from. UTC below is additive. */
  h: number;
  pain: number;
  /** UTC epoch ms. Absent on records written before offsets were stored;
   *  those are `offset-unknown` and are skipped by any analysis that
   *  needs real elapsed time. Never backfilled — the offset in force at
   *  capture is not recoverable, and guessing it would be inventing data. */
  ts?: number;
  /** local offset from UTC in minutes at capture. Absent = unknown. */
  tz?: number;
  /** pain-scale version at capture. Absent reads as 3. */
  sv?: number;
  loc?: string[];
  /** 1 = the where question was put to the user at this moment. With
   *  `loc` absent it means "asked, nothing selected" — which is an
   *  answer, and a different thing from never having been asked. */
  locAsked?: 1;
  /** 1 = the question was put and the user declined it. Distinct again
   *  from "asked, nothing selected": one says there were no areas, the
   *  other says they would rather not answer. Both are honest; neither
   *  is a value. */
  locSkipped?: 1;
  /** where, in the user's own words — "outer side of the right wrist,
   *  up into the thumb". The chips answer where coarsely and fast; this
   *  carries the precision a fixed vocabulary cannot. Free text, capped,
   *  never parsed: it is shown back as written, and no engine reads it. */
  locNote?: string;
  /** pain-quality words — the SOCRATES "Character" answer, per moment */
  q?: string[];
}

/** the longest a location description can be — same cap as every other
 *  note field, long enough for a sentence, short enough to stay one */
export const LOC_NOTE_MAX = 280;

export interface Entry {
  pain: number;
  cap: number | null;
  note: string;
  logs?: Moment[];
  factors?: string[];
  /** day-scoped answers, keyed by metric id — see ContextAnswers */
  ctx?: ContextAnswers;
}

/* ── day-scoped context answers ──────────────────────────────
   The two active factors, plus interference, live here rather than on a
   moment: they describe the day, are asked once, and are revisable from
   the day detail. Keyed by METRIC ID, never by displayed text, so the
   wording can change without orphaning the answers. */

export interface Answer {
  /** level id for an ordinal, a number for a numeric scale. Empty for a
   *  set answer, whose content lives in `values`. */
  value: string | number;
  /** the chosen ids, for a set-typed metric. An EMPTY ARRAY is a real
   *  answer — "asked, nothing applied" — and is not the same as the key
   *  being absent, which is "never asked". */
  values?: string[];
  /** minutes since local midnight when the answer was given */
  h: number;
  ts: number;
  tz: number;
  /** wording version at capture. Answers from different versions of the
   *  same question are never pooled in an analysis. */
  qv: number;
  /** protocol active at capture, for provenance. null = none. */
  pid: number | null;
  /** 1 = the question was asked and the user declined it. A skip is an
   *  answer about the question, not an answer to it. */
  skipped?: 1;
  /** What the user wrote alongside the choice — "20 min walk, heat pad",
   *  in their words. Three levels are what the ANALYSIS can compare; this
   *  is what makes an answer legible to the person six weeks later, and
   *  to a clinician reading the day. NEVER read by the engine: it has no
   *  levels, no extremes, and nothing to compare against. It survives a
   *  skip, because "I didn't want to grade it, but here is what happened"
   *  is a real thing to say. */
  note?: string;
}

export interface ContextAnswers {
  /** context schema version */
  v: number;
  /** keyed by metric id. A key that is ABSENT was never asked. */
  a: Record<string, Answer>;
}

export const CONTEXT_VERSION = 1;

export type Entries = Record<string, Entry>; // key: 'YYYY-MM-DD'

/* ── tag vocabularies ─────────────────────────────────────────
   The id lists are the storage vocabulary; display names live with the
   screens. Same ids as the PWA so backups round-trip both ways. */

export const LOC_NAMES: Record<string, string> = {
  head: 'Head', neck: 'Neck', shoulders: 'Shoulders', upperBack: 'Upper back',
  lowerBack: 'Lower back', arms: 'Arms', hands: 'Hands', chest: 'Chest',
  belly: 'Belly', hips: 'Hips', legs: 'Legs', knees: 'Knees', feet: 'Feet',
  allOver: 'All over',

  /* ── sided and jointed, added 2026-08 for the body map ─────
     "Right wrist" was unrecordable: no wrist, no sides. These are
     ADDITIVE — every id above stays valid and displayed, old entries
     never migrate, and a restored backup keeps whichever vocabulary it
     was recorded in. The body map writes these; the legacy ids remain
     the words old data speaks. */
  shoulderL: 'Left shoulder', shoulderR: 'Right shoulder',
  armL: 'Left upper arm', armR: 'Right upper arm',
  elbowL: 'Left elbow', elbowR: 'Right elbow',
  forearmL: 'Left forearm', forearmR: 'Right forearm',
  wristL: 'Left wrist', wristR: 'Right wrist',
  handL: 'Left hand', handR: 'Right hand',
  hipL: 'Left hip', hipR: 'Right hip',
  thighL: 'Left thigh', thighR: 'Right thigh',
  kneeL: 'Left knee', kneeR: 'Right knee',
  calfL: 'Left calf', calfR: 'Right calf',
  ankleL: 'Left ankle', ankleR: 'Right ankle',
  footL: 'Left foot', footR: 'Right foot',
};

/* Legacy paired ids → their sided pair, for the PREFILL only. A person
   whose last check-in said 'knees' gets both knees pre-marked as the
   suggestion they then confirm or edit — a prefill is an offer, not a
   record, and the stored history itself is never rewritten. */
export const LOC_LEGACY_SIDED: Record<string, [string, string]> = {
  shoulders: ['shoulderL', 'shoulderR'],
  arms: ['armL', 'armR'],
  hands: ['handL', 'handR'],
  hips: ['hipL', 'hipR'],
  legs: ['thighL', 'thighR'],
  knees: ['kneeL', 'kneeR'],
  feet: ['footL', 'footR'],
};

/* the sided pairs, for reading a selection back as a person says it —
   "Both knees" rather than "Left knee · Right knee" */
const LOC_PAIRS: [string, string, string][] = [
  /* the pair label is the PLAIN plural — "Shoulders", not "Both
     shoulders": on a body map, both marked already says both */
  ['shoulderL', 'shoulderR', 'Shoulders'],
  ['armL', 'armR', 'Upper arms'],
  ['elbowL', 'elbowR', 'Elbows'],
  ['forearmL', 'forearmR', 'Forearms'],
  ['wristL', 'wristR', 'Wrists'],
  ['handL', 'handR', 'Hands'],
  ['hipL', 'hipR', 'Hips'],
  ['thighL', 'thighR', 'Thighs'],
  ['kneeL', 'kneeR', 'Knees'],
  ['calfL', 'calfR', 'Calves'],
  ['ankleL', 'ankleR', 'Ankles'],
  ['footL', 'footR', 'Feet'],
];

export interface LocPart {
  label: string;
  /** the ids this part stands for — what removing the tag removes */
  ids: string[];
}

/** a location selection as parts a person can read and remove — pairs
 *  collapse to their plain plural, everything else speaks its name */
export function readLocParts(selected: string[]): LocPart[] {
  const rest = selected.slice();
  const parts: LocPart[] = [];
  LOC_PAIRS.forEach(([l, r, label]) => {
    const iL = rest.indexOf(l), iR = rest.indexOf(r);
    if (iL >= 0 && iR >= 0) {
      parts.push({ label, ids: [l, r] });
      rest.splice(Math.max(iL, iR), 1);
      rest.splice(Math.min(iL, iR), 1);
    }
  });
  rest.forEach((id) => parts.push({ label: LOC_NAMES[id] || id, ids: [id] }));
  return parts;
}

/** the same, as one spoken string */
export function readLocSelection(selected: string[]): string {
  return readLocParts(selected).map((p) => p.label).join(' · ');
}

/** a location set with legacy paired ids expanded to their sides —
 *  used when yesterday's places seed today's map */
export function expandLegacyLocs(ids: string[]): string[] {
  const out: string[] = [];
  ids.forEach((id) => {
    const pair = LOC_LEGACY_SIDED[id];
    if (pair) { pair.forEach((p) => { if (out.indexOf(p) < 0) out.push(p); }); }
    else if (out.indexOf(id) < 0) out.push(id);
  });
  return out;
}

/* the ids the CHIPS offer — the coarse vocabulary. The sided ids stay
   in LOC_NAMES so every body-map-era entry keeps displaying exactly as
   recorded; they are just no longer what the question offers. */
export const LOC_CHIP_IDS = [
  'head', 'neck', 'shoulders', 'upperBack', 'lowerBack', 'arms', 'hands',
  'chest', 'belly', 'hips', 'legs', 'knees', 'feet', 'allOver',
];

/* every sided id → the coarse family word the chips speak */
const LOC_SIDED_FAMILY: Record<string, string> = {
  shoulderL: 'shoulders', shoulderR: 'shoulders',
  armL: 'arms', armR: 'arms', elbowL: 'arms', elbowR: 'arms',
  forearmL: 'arms', forearmR: 'arms',
  wristL: 'hands', wristR: 'hands', handL: 'hands', handR: 'hands',
  hipL: 'hips', hipR: 'hips',
  thighL: 'legs', thighR: 'legs', calfL: 'legs', calfR: 'legs',
  kneeL: 'knees', kneeR: 'knees',
  ankleL: 'feet', ankleR: 'feet', footL: 'feet', footR: 'feet',
};

/** a location set spoken in the chips' coarse vocabulary — used ONLY
 *  for the prefill, so a body-map-era "left knee" offers today's
 *  "Knees" chip. An offer to edit, never a rewrite: the stored entry
 *  keeps its sided words forever. */
export function collapseSidedLocs(ids: string[]): string[] {
  const out: string[] = [];
  ids.forEach((id) => {
    const fam = LOC_SIDED_FAMILY[id] || id;
    if (out.indexOf(fam) < 0) out.push(fam);
  });
  return out;
}
export const FACTOR_NAMES: Record<string, string> = {
  sleep: 'Sleep', stress: 'Stress', work: 'Work', sitting: 'Long sitting',
  activity: 'Physical activity', weather: 'Weather', food: 'Food',
  meds: 'Medication', driving: 'Driving', screens: 'Screen time',
  family: 'Family', rest: 'Rest',
};
export const LOCIDS = Object.keys(LOC_NAMES);
export const FACTORIDS = Object.keys(FACTOR_NAMES);

/* ── dates ──────────────────────────────────────────────────── */

export function iso(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function todayISO(): string { return iso(new Date()); }
export function dateFromISO(s: string): Date {
  const p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
export function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/* ── cleaning (untrusted input: backups, old storage) ───────── */

function cleanIds(a: unknown, valid: string[]): string[] | undefined {
  if (!Array.isArray(a)) return undefined;
  const out = a.filter((id): id is string => typeof id === 'string' && valid.indexOf(id) >= 0);
  return out.length ? out : undefined;
}

/** factors keeps its tri-state: [] survives as "asked, none chosen" */
export function cleanFactors(a: unknown): string[] | undefined {
  const fc = cleanIds(a, FACTORIDS);
  if (fc) return fc;
  return Array.isArray(a) ? [] : undefined;
}

/** legacy {m,d,e} slots map to the middle of the window they meant */
const LEGACYSLOT: Record<string, number> = { m: 9 * 60, d: 14 * 60, e: 20 * 60 };

/** a finite integer within range, or undefined — for the additive fields
 *  whose absence is meaningful and must never become a zero */
function cleanInt(v: unknown, lo: number, hi: number): number | undefined {
  if (typeof v !== 'number' || !isFinite(v)) return undefined;
  const n = Math.round(v);
  return n >= lo && n <= hi ? n : undefined;
}

export function cleanLogs(l: unknown): Moment[] | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const out: Moment[] = [];
  const push = (raw: Record<string, unknown>, h: unknown, pain: unknown, loc?: unknown, q?: unknown) => {
    if (typeof pain !== 'number' || pain < 0 || pain > 10) return;
    if (typeof h !== 'number' || h < 0 || h > 1439) return;
    const v: Moment = { h: Math.round(h), pain: Math.round(pain) };
    const lc = cleanIds(loc, LOCIDS);
    if (lc) v.loc = lc;
    // an empty selection is an answer, so the asked-marker survives on its own
    if (raw.locAsked === 1 || (Array.isArray(loc) && !lc)) v.locAsked = 1;
    if (raw.locSkipped === 1) { v.locSkipped = 1; v.locAsked = 1; }
    // the user's own words survive a backup round-trip, re-capped
    if (typeof raw.locNote === 'string' && raw.locNote.trim()) {
      v.locNote = raw.locNote.trim().slice(0, LOC_NOTE_MAX);
    }
    const qc = cleanIds(q, QUALITYIDS);
    if (qc) v.q = qc;
    const ts = typeof raw.ts === 'number' && isFinite(raw.ts) && raw.ts > 0 ? Math.round(raw.ts) : undefined;
    if (ts !== undefined) v.ts = ts;
    const tz = cleanInt(raw.tz, -18 * 60, 18 * 60);
    if (tz !== undefined) v.tz = tz;
    const sv = cleanInt(raw.sv, 1, 99);
    if (sv !== undefined) v.sv = sv;
    out.push(v);
  };
  if (Array.isArray(l)) {
    l.forEach((v) => { if (v) push(v as Record<string, unknown>, v.h, v.pain, v.loc, v.q); });
  } else {
    (['m', 'd', 'e'] as const).forEach((s) => {
      const slot = (l as Record<string, { pain?: unknown }>)[s];
      if (slot) push({}, LEGACYSLOT[s], slot.pain);
    });
  }
  // one moment per minute — later entries win, matching save semantics
  const byH: Record<number, Moment> = {};
  out.forEach((v) => { byH[v.h] = v; });
  const clean = Object.keys(byH).map((k) => byH[+k]);
  clean.sort((a, b) => a.h - b.h);
  return clean.length ? clean : undefined;
}

export function validEntry(e: unknown): e is { pain: number; cap?: number | null } {
  const x = e as { pain?: unknown; cap?: unknown };
  return !!e && typeof e === 'object' &&
    typeof x.pain === 'number' && x.pain >= 0 && x.pain <= 10 &&
    (x.cap == null || (typeof x.cap === 'number' && x.cap >= 0 && x.cap <= 10));
}

/** one raw context answer, or null to drop it. An answer whose metric id
 *  is unknown, or whose value the metric could not have produced, is
 *  DROPPED rather than coerced — a value nobody can interpret is worse
 *  than a gap, because a gap is honest about itself. */
export function cleanAnswer(metricId: string, raw: unknown): Answer | null {
  if (!isKnownMetric(metricId)) return null;
  const r = raw as Partial<Answer>;
  if (!r || typeof r !== 'object') return null;
  const h = cleanInt(r.h, 0, 1439);
  if (h === undefined) return null;
  const skipped = r.skipped === 1;
  const set = isSetMetric(metricId);
  if (!skipped && !set && !validAnswerValue(metricId, r.value)) return null;
  if (!skipped && set && !Array.isArray(r.values)) return null;
  const a: Answer = {
    value: skipped || set ? '' : (r.value as string | number),
    h,
    ts: typeof r.ts === 'number' && isFinite(r.ts) && r.ts > 0 ? Math.round(r.ts) : 0,
    tz: cleanInt(r.tz, -18 * 60, 18 * 60) ?? 0,
    qv: cleanInt(r.qv, 1, 999) ?? 1,
    pid: typeof r.pid === 'number' && isFinite(r.pid) ? Math.round(r.pid) : null,
  };
  if (set && !skipped) {
    a.values = (r.values as unknown[])
      .filter((v): v is string => typeof v === 'string' && validSetMember(metricId, v));
  }
  if (skipped) a.skipped = 1;
  /* Free text, kept on a skip as readily as on an answer, and capped
     rather than rejected: a note too long is a note to trim, never a
     reason to lose the choice it was attached to. */
  if (typeof r.note === 'string' && r.note.trim()) a.note = r.note.trim().slice(0, 280);
  return a;
}

/** a whole day's context block. undefined = nothing was ever asked. */
export function cleanCtx(raw: unknown): ContextAnswers | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { v?: unknown; a?: unknown };
  if (!r.a || typeof r.a !== 'object') return undefined;
  const a: Record<string, Answer> = {};
  Object.keys(r.a as object).forEach((id) => {
    const ans = cleanAnswer(id, (r.a as Record<string, unknown>)[id]);
    if (ans) a[id] = ans;
  });
  if (!Object.keys(a).length) return undefined;
  return { v: cleanInt(r.v, 1, 999) ?? CONTEXT_VERSION, a };
}

/** does this day hold any context answer at all? */
export function hasCtx(e: Entry | null | undefined): boolean {
  return !!(e && e.ctx && Object.keys(e.ctx.a).length > 0);
}

/** the answer to one metric on one day, or null. A skipped answer is
 *  returned as-is: callers decide what a skip means to them, and none of
 *  them may treat it as a value. */
export function answerOf(e: Entry | null | undefined, metricId: string): Answer | null {
  if (!e || !e.ctx) return null;
  return e.ctx.a[metricId] || null;
}

/** the usable value, or null when unasked OR skipped — the shape every
 *  analysis wants, with both kinds of absence collapsed only at the very
 *  last step and never in storage */
export function valueOf(e: Entry | null | undefined, metricId: string): string | number | null {
  const a = answerOf(e, metricId);
  if (!a || a.skipped === 1) return null;
  return a.value;
}

/** the chosen ids of a set answer. null = unasked or skipped; [] = asked
 *  and nothing applied, which is an answer and is counted as one. */
export function valuesOf(e: Entry | null | undefined, metricId: string): string[] | null {
  const a = answerOf(e, metricId);
  if (!a || a.skipped === 1 || !a.values) return null;
  return a.values;
}

/** normalize one raw imported day into a clean Entry, or null to skip */
export function cleanEntry(raw: unknown): Entry | null {
  if (!validEntry(raw)) return null;
  const r = raw as {
    pain: number; cap?: number | null; note?: unknown;
    factors?: unknown; logs?: unknown; ctx?: unknown;
  };
  const e: Entry = {
    pain: Math.round(r.pain),
    cap: r.cap == null ? null : Math.round(r.cap),
    note: typeof r.note === 'string' ? r.note : '',
  };
  const fc = cleanFactors(r.factors);
  if (fc) e.factors = fc;
  const cx = cleanCtx(r.ctx);
  if (cx) e.ctx = cx;
  const lg = cleanLogs(r.logs);
  if (lg) { e.logs = lg; syncDayPain(e); }
  return e;
}

/** a whole backup { entries: {...} } → clean Entries; backup wins per day */
export function cleanBackup(data: unknown): Entries {
  const src = (data as { entries?: unknown })?.entries;
  const out: Entries = {};
  if (!src || typeof src !== 'object') return out;
  Object.keys(src as object).forEach((k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    const e = cleanEntry((src as Record<string, unknown>)[k]);
    if (e) out[k] = e;
  });
  return out;
}

/* ── the peak rule ──────────────────────────────────────────── */

/** a day's moments, always an array — screens should not repeat this check */
export function logsOf(e: Entry | null | undefined): Moment[] {
  return e && e.logs ? e.logs : [];
}

/** minutes since midnight as a clock time */
export function fmtTime(h: number): string {
  return Math.floor(h / 60) + ':' + String(h % 60).padStart(2, '0');
}

export function peakOf(logs: Moment[]): number {
  return logs.reduce((m, l) => (l.pain > m ? l.pain : m), 0);
}
export function syncDayPain(e: Entry): Entry {
  if (e.logs && e.logs.length) e.pain = peakOf(e.logs);
  return e;
}

/* ── writes (pure: Entry in, Entry out) ─────────────────────── */

/** rebuild a day entry preserving everything the write doesn't touch */
function carryDay(prev: Entry | null, pain: number): Entry {
  const e: Entry = {
    pain,
    cap: prev && prev.cap != null ? prev.cap : null,
    note: (prev && prev.note) || '',
  };
  if (prev && prev.factors) e.factors = prev.factors;
  if (prev && prev.ctx) e.ctx = prev.ctx;
  return e;
}

/** the additive facts about a write that the old positional signature had
 *  nowhere to put. Optional throughout: a caller that knows none of them
 *  writes exactly the record it used to. */
export interface MomentMeta {
  /** UTC epoch ms at capture */
  ts?: number;
  /** local offset from UTC in minutes at capture */
  tz?: number;
  /** pain-scale version at capture */
  sv?: number;
  /** the where question was put to the user, whatever they chose */
  locAsked?: boolean;
  /** ...and they declined it */
  locSkipped?: boolean;
  /** where, described in the user's own words. Undefined = the writer
   *  did not put the question, and any existing text is left alone;
   *  '' = the user cleared it, and the clearing is honored. The
   *  difference matters: the pain-step write must not erase what the
   *  where-step wrote a moment ago. */
  locNote?: string;
}

/** stamp the current instant. Kept here so every writer agrees on what
 *  "now" means and no screen invents its own. */
export function nowMeta(sv?: number): MomentMeta {
  const d = new Date();
  const m: MomentMeta = { ts: d.getTime(), tz: -d.getTimezoneOffset() };
  if (sv !== undefined) m.sv = sv;
  return m;
}

/** write one moment; edit-in-place when a moment at `h` exists */
export function applyMoment(
  prev: Entry | null, h: number, pain: number,
  loc?: string[] | null, q?: string[] | null, meta?: MomentMeta
): Entry {
  const prevLogs = (prev && prev.logs) || [];
  const prevFloor = prev && prev.pain != null && prev.pain > (prevLogs.length ? peakOf(prevLogs) : -1)
    ? prev.pain : null;
  const e = carryDay(prev, prev && prev.pain != null ? prev.pain : pain);
  const logs = prevLogs.slice();
  const moment: Moment = { h, pain };
  if (loc && loc.length) moment.loc = loc.slice();
  if (meta && meta.locSkipped) { moment.locSkipped = 1; moment.locAsked = 1; }
  else if (meta && meta.locAsked) moment.locAsked = 1;
  else if (loc && loc.length) moment.locAsked = 1;
  if (meta && meta.locNote !== undefined && meta.locNote.trim()) {
    moment.locNote = meta.locNote.trim().slice(0, LOC_NOTE_MAX);
  }
  if (q && q.length) moment.q = q.slice();
  if (meta) {
    if (meta.ts !== undefined) moment.ts = meta.ts;
    if (meta.tz !== undefined) moment.tz = meta.tz;
    if (meta.sv !== undefined) moment.sv = meta.sv;
  }
  const i = logs.findIndex((l) => l.h === h);
  // editing in place keeps the ORIGINAL capture stamp when the edit
  // carries none — the moment happened when it happened
  if (i >= 0) {
    const was = logs[i];
    if (moment.ts === undefined && was.ts !== undefined) moment.ts = was.ts;
    if (moment.tz === undefined && was.tz !== undefined) moment.tz = was.tz;
    if (moment.sv === undefined && was.sv !== undefined) moment.sv = was.sv;
    if (!moment.locAsked && was.locAsked) moment.locAsked = 1;
    if (!moment.locSkipped && was.locSkipped && !moment.loc) moment.locSkipped = 1;
    /* nothing typed is thrown away without being asked: only an
       explicit '' (the user cleared the field) removes the words */
    if (moment.locNote === undefined && was.locNote !== undefined
      && (!meta || meta.locNote === undefined)) moment.locNote = was.locNote;
    logs[i] = moment;
  } else logs.push(moment);
  logs.sort((a, b) => a.h - b.h);
  e.logs = logs;
  syncDayPain(e);
  if (prevFloor != null && prevFloor > e.pain) e.pain = prevFloor;
  return e;
}

/** Remove the moment at `h`; null = the whole day goes.
 *
 *  A day is kept when ANYTHING the user put there survives the removal.
 *  This used to test the note alone, which was harmless while `cap` and
 *  `factors` were vestigial — and stopped being harmless the moment the
 *  day row started carrying context answers. Deleting a mistyped reading
 *  must never take the day's sleep, stress or interference with it. */
export function removeMoment(prev: Entry, h: number): Entry | null {
  const kept = (prev.logs || []).filter((l) => l.h !== h);
  if (kept.length) {
    const e: Entry = { ...prev, logs: kept };
    return syncDayPain(e);
  }
  const anchored = !!prev.note
    || prev.cap != null
    || prev.factors !== undefined
    || hasCtx(prev);
  if (!anchored) return null;
  const e: Entry = { ...prev };
  delete e.logs;
  return e;
}

/* ── events: flares, treatments, notable moments ─────────────
   The event log answers the two questions every clinician asks that the
   daily check-in cannot: what does it feel like (Character), and what have
   you tried and did it help. */

/** `sleep` is LEGACY-READABLE ONLY: it left the picker when sleep became a
 *  daily factor with a scale, but existing rows are the user's record and
 *  are never rewritten into another category. `medication` and `illness`
 *  are new; nothing was merged to make room for them. */
export type EventKind =
  | 'flare' | 'treatment' | 'activity' | 'sleep' | 'other'
  | 'medication' | 'illness';

/** what the user tried. A record of an action, carrying no theory about
 *  why it might work — Shiatsu and a hot water bottle are stored the same
 *  way, and Pattern has an opinion about neither. */
export const INTERVENTIONS: Record<string, string> = {
  medication: 'Medication', heat: 'Heat', cold: 'Cold', movement: 'Movement',
  rest: 'Rest', breathing: 'Breathing', exercise: 'Exercise',
  physio: 'Physiotherapy', massage: 'Massage', shiatsu: 'Shiatsu',
  acupuncture: 'Acupuncture', other: 'Other',
};
export const INTERVENTIONIDS = Object.keys(INTERVENTIONS);

/** how it went afterwards, in the user's own judgement. "Not sure" is a
 *  real answer and is stored as one — it is not a skip. */
export type Response = 'better' | 'same' | 'worse' | 'unsure';
export const RESPONSE_LABELS: Record<Response, string> = {
  better: 'Better', same: 'About the same', worse: 'Worse', unsure: 'Not sure',
};
export const RESPONSES = Object.keys(RESPONSE_LABELS) as Response[];

/* ── the guided note ─────────────────────────────────────────
   Against SOCRATES — the frame the report already follows — this record
   had Site, Character, Severity, Time and Exacerbating/relieving, and was
   missing ONSET and RADIATION. Those two are what a clinician asks first
   about a flare and what nobody can reconstruct three weeks later.

   They are asked as a short run of fixed questions, not a conversation.
   A conversation would imply something is listening, and nothing is: the
   questions are a list in this file. Naming it a chat is how a scripted
   tree turns into pattern-matching theatre, which this app has retired
   once already. */

export type Onset = 'sudden' | 'gradual' | 'ongoing';
export const ONSET_LABELS: Record<Onset, string> = {
  sudden: 'Came on suddenly',
  gradual: 'Built up gradually',
  ongoing: 'It was already there',
};
export const ONSETS = Object.keys(ONSET_LABELS) as Onset[];

export type Duration = 'minutes' | 'hours' | 'mostDay' | 'days';
export const DURATION_LABELS: Record<Duration, string> = {
  minutes: 'Minutes',
  hours: 'A few hours',
  mostDay: 'Most of the day',
  days: 'Days',
};
export const DURATIONS = Object.keys(DURATION_LABELS) as Duration[];

export interface PainEvent {
  id?: number;
  date: string;      // YYYY-MM-DD
  h: number;         // minutes since midnight
  kind: EventKind;
  text: string;
  /** pain-quality words — the SOCRATES "Character" answer */
  quality?: string[];
  /** LEGACY: the user's own impression of effect, 0–10, on records
   *  written before the four-level response existed. Retained and never
   *  rewritten — no cutpoint between a 0–10 scale and Better/Same/Worse
   *  would be anything but invented, so the two are stored side by side
   *  and the report says which one it is showing. */
  helped?: number | null;
  /** what was tried — an id from INTERVENTIONS */
  intervention?: string;
  /** how it went, on records written since. Never mapped onto `helped`. */
  resp?: Response;
  /** how it started — SOCRATES "Onset" */
  onset?: Onset;
  /** how long it lasted, in the coarse buckets people actually recall */
  duration?: Duration;
  /** where it travelled to, in the user's words — SOCRATES "Radiation".
   *  Free text rather than body regions: "down the back of my leg" is the
   *  answer a clinician wants, and a region picker cannot say it. */
  spread?: string;
  /** what they were doing when it started. Free text, because the useful
   *  answers are too various to list and too specific to guess. */
  doing?: string;
  /** 1 = the user chose to file this alongside that day's check-ins.
   *  Association only — no causal relationship is stored or implied. */
  linked?: number;
}

export const QUALITY_NAMES: Record<string, string> = {
  aching: 'Aching', burning: 'Burning', stabbing: 'Stabbing',
  pressure: 'Pressure', throbbing: 'Throbbing', tingling: 'Tingling',
  numb: 'Numbness', sensitive: 'Sensitive to touch',
};
export const QUALITYIDS = Object.keys(QUALITY_NAMES);

export function cleanQuality(a: unknown): string[] | undefined {
  return cleanIds(a, QUALITYIDS);
}

/** what tends to make it better or worse — asked once with the protocol,
 *  not daily. A stable characteristic of the pain, not a variable, and
 *  asking it every day would be pure burden for a value that rarely moves. */
export function cleanModifiers(a: unknown): string[] {
  return cleanIds(a, MODIFIERIDS) || [];
}

/* ── where-step defaults: confirm, not choose ────────────────
   Chronic pain usually lives in the same places, so the where step opens
   with the most recent day's places already selected. */

export function defaultLocs(entries: Entries, todayIso: string, horizon = 14): string[] {
  for (let back = 0; back <= horizon; back++) {
    const d = dateFromISO(todayIso);
    d.setDate(d.getDate() - back);
    const e = entries[iso(d)];
    if (!e) continue;
    const logs = logsOf(e);
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (l.loc && l.loc.length) return l.loc.slice();
    }
  }
  return [];
}

/* ── the daily average ───────────────────────────────────────
   ONE definition, used by the home hero, the calendar, the day detail,
   the report and every VoiceOver string. A day's stored `pain` remains
   the PEAK (that is what the legacy floor protects and what old records
   mean); the AVERAGE is derived and never stored, so the two can never
   fall out of step. */

/** how many completed check-ins a day holds */
export function checkinCount(e: Entry | null | undefined): number {
  if (!e) return 0;
  const logs = logsOf(e);
  // a legacy day carries a value with no moments behind it — still one answer
  return logs.length ? logs.length : 1;
}

/** the mean of a day's check-ins, or the day value when there are no
 *  timestamped moments (legacy and backfilled days). null = nothing logged. */
export function dailyAverage(e: Entry | null | undefined): number | null {
  if (!e) return null;
  const logs = logsOf(e);
  if (!logs.length) return typeof e.pain === 'number' ? e.pain : null;
  const sum = logs.reduce((s, l) => s + l.pain, 0);
  return Math.round((sum / logs.length) * 10) / 10;
}

/**
 * The day in one sentence, computed from what was entered and nothing
 * else. "11 check-ins between 7:04 and 23:54, from 2 to 7 — mostly
 * Moderate, ending higher than it began."
 *
 * Every clause is deterministic: same data, same sentence, on this
 * screen, in a test, and years from now. That is the property that makes
 * a generated sentence safe in a health record — it is a READING of the
 * numbers beside it, reproducible by hand, never a paraphrase and never
 * stored. Nothing here rewards a re-open, because nothing here changes
 * unless a check-in does.
 *
 * What each clause is allowed to say:
 *  - the count and the times: facts, verbatim.
 *  - the range: the two ends the user actually entered. Not a variance,
 *    not a spread score — those would be numbers nobody typed.
 *  - "mostly X": the scale word that covers a strict majority of the
 *    day's check-ins, painLabel's own vocabulary. No majority, no claim.
 *  - "ending higher/lower than it began": last against first, and only
 *    past DAY_SHAPE_MIN_DELTA — the same gate the Today card uses, for
 *    the same reason. Below it the day just ends, undescribed.
 */
export function daySummary(logs: Moment[]): string | null {
  if (!logs.length) return null;
  const sorted = logs.slice().sort((a, b) => a.h - b.h);
  const n = sorted.length;
  const first = sorted[0], last = sorted[n - 1];
  const low = sorted.reduce((m, l) => (l.pain < m ? l.pain : m), 10);
  const high = sorted.reduce((m, l) => (l.pain > m ? l.pain : m), 0);

  if (n === 1) {
    return 'One check-in at ' + fmtTime(first.h) + ' — '
      + formatScore(first.pain) + ', ' + painLabel(first.pain) + '.';
  }

  let s = n + ' check-ins between ' + fmtTime(first.h) + ' and ' + fmtTime(last.h);
  s += low === high
    ? ', all at ' + formatScore(low)
    : ', from ' + formatScore(low) + ' to ' + formatScore(high);

  const tail: string[] = [];
  /* a day pinned to one value already names its own word — "all at 5 —
     all Moderate" would say the same thing twice */
  if (low !== high) {
    const byWord: Record<string, number> = {};
    sorted.forEach((l) => {
      const w = painLabel(l.pain);
      byWord[w] = (byWord[w] || 0) + 1;
    });
    const words = Object.keys(byWord).sort((a, b) => byWord[b] - byWord[a]);
    if (byWord[words[0]] > n / 2) {
      tail.push(byWord[words[0]] === n ? 'all ' + words[0] : 'mostly ' + words[0]);
    }
  }
  const d = last.pain - first.pain;
  if (Math.abs(d) >= DAY_SHAPE_MIN_DELTA) {
    tail.push(d > 0 ? 'ending higher than it began' : 'ending lower than it began');
  }
  return s + (tail.length ? ' — ' + tail.join(', ') : '') + '.';
}

/* ── function: ability at the activity you want back ─────────
   A separate 0–10 scale, stored apart from pain and never averaged with
   it. Asked at most once a week, updatable by hand. */

export interface FuncEntry {
  week: string;    // the Monday of the week rated, YYYY-MM-DD
  ability: number; // 0 = not able at all, 10 = fully able
  note?: string;
  /** the calendar day the rating was actually saved — availability is
   *  seven elapsed days from here. Older records lack it; their week
   *  Monday stands in. */
  savedOn?: string;
}

export function mondayOf(dateIso: string): string {
  const d = dateFromISO(dateIso);
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift);
  return iso(d);
}

export function addDays(dateIso: string, days: number): string {
  const d = dateFromISO(dateIso);
  d.setDate(d.getDate() + days);
  return iso(d);
}

/** the day a rating was saved, falling back to its week for old records */
export function funcSavedOn(f: FuncEntry): string {
  return f.savedOn || f.week;
}

/** the day the next weekly check-in opens: seven elapsed calendar days
 *  from the last saved rating. null = no rating yet (baseline first). */
export function funcNextDate(entries: FuncEntry[]): string | null {
  if (!entries.length) return null;
  const last = entries.reduce((m, f) => (funcSavedOn(f) > funcSavedOn(m) ? f : m));
  return addDays(funcSavedOn(last), 7);
}

export type FuncState =
  | { kind: 'noGoal' }
  | { kind: 'baseline' }                    // activity chosen, no starting point yet
  | { kind: 'wait'; until: string }         // rated recently — next date shown
  | { kind: 'due' };                        // seven days have elapsed

/** what the home card and sheet should offer today */
export function funcStatus(entries: FuncEntry[], todayIso: string, hasActivity: boolean): FuncState {
  if (!hasActivity) return { kind: 'noGoal' };
  if (!entries.length) return { kind: 'baseline' };
  const next = funcNextDate(entries)!;
  return todayIso >= next ? { kind: 'due' } : { kind: 'wait', until: next };
}

/** kept for old call sites: due means the weekly ask is open */
export function funcDue(entries: FuncEntry[], todayIso: string, hasActivity: boolean): boolean {
  return funcStatus(entries, todayIso, hasActivity).kind === 'due';
}

/* Fixed question copy. Free-text activity names are NEVER interpolated
   into sentences ("How able have you felt to running?" is what happens
   when they are) — the activity is always shown separately, under a
   label, and the question stays grammatical for every possible name. */
export const FUNC_BASELINE_TITLE = 'Set your starting point';
export const FUNC_BASELINE_QUESTION = 'How able are you to do this activity today?';
export const FUNC_WEEKLY_TITLE = 'This week';
export const FUNC_WEEKLY_QUESTION = 'How able were you to do this activity this week?';
export const GOAL_EDITOR_TITLE = 'Activity I want back';
export const GOAL_EDITOR_DESCRIPTION =
  'Choose one activity you want to return to or do more easily. You’ll rate your ability once a week.';

/** first and last rating, when there are two to compare */
export function funcTrend(entries: FuncEntry[]): { first: FuncEntry; last: FuncEntry } | null {
  if (entries.length < 2) return null;
  const sorted = entries.slice().sort((a, b) => (a.week < b.week ? -1 : 1));
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

/** the most recent rating, for the home card */
export function latestFunc(entries: FuncEntry[]): FuncEntry | null {
  if (!entries.length) return null;
  return entries.slice().sort((a, b) => (a.week < b.week ? -1 : 1))[entries.length - 1];
}

/* ── events ──────────────────────────────────────────────────
   Things that happened, recorded as events — never as confirmed triggers,
   and never with a claim that one caused another. */

export const EVENT_LABELS: Record<EventKind, string> = {
  flare: 'Flare',
  treatment: 'Treatment',
  medication: 'Medication change',
  activity: 'Unusual activity',
  illness: 'Illness or injury',
  sleep: 'Poor sleep',
  other: 'Something else',
};
export const EVENT_KINDS = Object.keys(EVENT_LABELS) as EventKind[];

/** what the picker offers. `sleep` is absent: it is a daily factor now,
 *  and offering both would split the same observation across two places.
 *  Reading it stays supported forever — see EventKind. */
export const EVENT_KINDS_OFFERED: EventKind[] =
  EVENT_KINDS.filter((k) => k !== 'sleep');

/* ── the hypothesis and its observation protocol ─────────────
   The user says, in their own words, what they are trying to understand.
   Those words are stored verbatim, reach the doctor report unaltered, and
   are never sent anywhere or parsed for meaning by anything remote — a
   sentence about your own pain is health data, and this app's privacy
   answer has to stay literally true.

   A protocol is one pair of active factors over one period. Exactly one
   is active at a time. Editing a factor CLOSES the period and opens a new
   one rather than rewriting history: answers are never retro-labelled,
   because a question that changed mid-way is two questions.

   Analysis pools answers by (metric id, wording version), NOT by
   protocol — two consecutive periods asking the same question at the same
   wording pool correctly, which is the only thing that makes a slow
   hypothesis reachable. `pid` is provenance: it tells the report which
   period an observation came from, and lets a period be excluded if its
   definition later turns out not to match. */

export interface Hypothesis {
  id?: number;
  createdOn: string;
  /** "What are you trying to understand about your pain?" */
  understand: string;
  /** "What do you think makes it harder?" */
  harder: string;
  /** "What seems to help?" */
  helps: string;
}

export type ProtocolStatus = 'active' | 'completed' | 'abandoned';

export interface Protocol {
  id?: number;
  version: number;
  startDate: string;
  /** null while active */
  endDate: string | null;
  /** the first review point — a checkpoint, never a promised conclusion */
  reviewOn: string;
  /** metric id the user nominated */
  chosenFactor: string;
  /** metric id the user did NOT nominate. Not called a control anywhere
   *  the user can see it: telling someone their judgement is being
   *  checked is both discourteous and likely to change how they answer.
   *  It exists so the app can compare a believed factor against an
   *  unbelieved one, and find out whether it is measuring pain or belief. */
  secondFactor: string;
  hypothesisId: number | null;
  status: ProtocolStatus;
}

export const PROTOCOL_VERSION = 1;
const PROTOCOL_STATUSES: ProtocolStatus[] = ['active', 'completed', 'abandoned'];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function cleanHypothesis(raw: unknown): Omit<Hypothesis, 'id'> | null {
  const r = raw as Partial<Hypothesis>;
  if (!r || typeof r !== 'object') return null;
  if (!isIsoDate(r.createdOn)) return null;
  const h = {
    createdOn: r.createdOn,
    understand: str(r.understand), harder: str(r.harder), helps: str(r.helps),
  };
  // three empty answers is not a hypothesis, it is a skipped screen
  if (!h.understand.trim() && !h.harder.trim() && !h.helps.trim()) return null;
  return h;
}

export function cleanProtocol(raw: unknown): Omit<Protocol, 'id'> | null {
  const r = raw as Partial<Protocol>;
  if (!r || typeof r !== 'object') return null;
  if (!isIsoDate(r.startDate) || !isIsoDate(r.reviewOn)) return null;
  if (typeof r.chosenFactor !== 'string' || !isKnownMetric(r.chosenFactor)) return null;
  if (typeof r.secondFactor !== 'string' || !isKnownMetric(r.secondFactor)) return null;
  const status = PROTOCOL_STATUSES.indexOf(r.status as ProtocolStatus) >= 0
    ? (r.status as ProtocolStatus) : 'completed';
  return {
    version: typeof r.version === 'number' ? Math.round(r.version) : PROTOCOL_VERSION,
    startDate: r.startDate,
    endDate: isIsoDate(r.endDate) ? r.endDate : null,
    reviewOn: r.reviewOn,
    chosenFactor: r.chosenFactor,
    secondFactor: r.secondFactor,
    hypothesisId: typeof r.hypothesisId === 'number' ? Math.round(r.hypothesisId) : null,
    status,
  };
}

/** content identity for a protocol, so a merge does not duplicate one */
export function protocolKey(p: Omit<Protocol, 'id'>): string {
  return [p.startDate, p.chosenFactor, p.secondFactor].join('|');
}

/* ── migration ───────────────────────────────────────────────
   Pain has always been stored as an integer 0–10, so scale v1 → v2 changes
   no stored value: the words moved, the numbers did not. This pass exists
   to coerce anything malformed (a decimal from a hand-edited backup, an
   out-of-range number) into the domain. It is idempotent and reports how
   many values it corrected, so a test can prove a clean store needs none. */

export function migrateEntries(entries: Entries): { entries: Entries; corrected: number } {
  let corrected = 0;
  const out: Entries = {};
  Object.keys(entries).forEach((k) => {
    const e = entries[k];
    if (!e) return;
    const p = normalizePain(e.pain);
    if (p == null) return;              // unusable day: dropped rather than guessed
    const next: Entry = { ...e };
    if (p !== e.pain) corrected++;
    next.pain = p;
    if (e.logs) {
      const logs: Moment[] = [];
      e.logs.forEach((l) => {
        const lp = normalizePain(l.pain);
        if (lp == null) return;
        if (lp !== l.pain) corrected++;
        logs.push({ ...l, pain: lp });
      });
      if (logs.length) { next.logs = logs; syncDayPain(next); }
      else delete next.logs;
    }
    out[k] = next;
  });
  return { entries: out, corrected };
}

/* ── backups: validation first, writes second ────────────────
   Restoring must never destroy current data before the incoming file has
   been fully validated, so validation is a pure pass over the parsed JSON
   that produces a clean, typed picture of what the file holds — or a
   plain refusal. The caller then chooses REPLACE or MERGE. */

/** v5 adds day context, hypotheses and protocols, and per-moment UTC.
 *  Every earlier version still restores: the new sections are simply
 *  absent, which is exactly what they were. */
export const BACKUP_VERSION = 5;

export interface ValidBackup {
  version: number;
  entries: Entries;
  events: Omit<PainEvent, 'id'>[];
  func: FuncEntry[];
  goal: string | null;
  hypotheses: Omit<Hypothesis, 'id'>[];
  protocols: Omit<Protocol, 'id'>[];
  modifiers: string[];
}

const okNum = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 10;
const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** one raw imported event → a clean one, or null to skip */
export function cleanEvent(raw: unknown): Omit<PainEvent, 'id'> | null {
  const r = raw as Partial<PainEvent>;
  if (!r || typeof r !== 'object') return null;
  if (!isIsoDate(r.date)) return null;
  if (typeof r.h !== 'number' || r.h < 0 || r.h > 1439) return null;
  if (EVENT_KINDS.indexOf(r.kind as EventKind) < 0) return null;
  const ev: Omit<PainEvent, 'id'> = {
    date: r.date, h: Math.round(r.h), kind: r.kind as EventKind,
    text: typeof r.text === 'string' ? r.text : '',
  };
  const q = cleanQuality(r.quality);
  if (q) ev.quality = q;
  if (okNum(r.helped)) ev.helped = Math.round(r.helped);
  if (typeof r.intervention === 'string' && INTERVENTIONIDS.indexOf(r.intervention) >= 0) {
    ev.intervention = r.intervention;
  }
  if (typeof r.resp === 'string' && RESPONSES.indexOf(r.resp as Response) >= 0) {
    ev.resp = r.resp as Response;
  }
  if (typeof r.onset === 'string' && ONSETS.indexOf(r.onset as Onset) >= 0) {
    ev.onset = r.onset as Onset;
  }
  if (typeof r.duration === 'string' && DURATIONS.indexOf(r.duration as Duration) >= 0) {
    ev.duration = r.duration as Duration;
  }
  if (typeof r.spread === 'string' && r.spread.trim()) ev.spread = r.spread;
  if (typeof r.doing === 'string' && r.doing.trim()) ev.doing = r.doing;
  if (r.linked === 1) ev.linked = 1;
  return ev;
}

/** parse and fully validate a backup file. null = not a Pattern backup.
 *  Accepts web v1 (entries only), native v2 (events + retired weekly rows),
 *  v3 (function check-ins) and v4 (rating dates). Nothing is written. */
export function validateBackup(json: string): ValidBackup | null {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    version?: unknown; entries?: unknown; events?: unknown;
    weekly?: unknown; func?: unknown; goal?: unknown;
    hypotheses?: unknown; protocols?: unknown;
  };
  // a file with no recognisable section at all is not a Pattern backup
  if (d.entries === undefined && d.func === undefined && d.events === undefined
    && d.hypotheses === undefined && d.protocols === undefined) return null;

  const entries = cleanBackup(data);

  const events: Omit<PainEvent, 'id'>[] = [];
  if (Array.isArray(d.events)) {
    d.events.forEach((raw) => {
      const ev = cleanEvent(raw);
      if (ev) events.push(ev);
    });
  }

  const func: FuncEntry[] = [];
  const pushFunc = (week: unknown, ability: unknown, note: unknown, savedOn: unknown) => {
    if (!isIsoDate(week) || !okNum(ability)) return;
    const f: FuncEntry = {
      week, ability: Math.round(ability),
      note: typeof note === 'string' ? note : '',
    };
    if (isIsoDate(savedOn)) f.savedOn = savedOn;
    func.push(f);
  };
  if (Array.isArray(d.func)) {
    d.func.forEach((raw) => {
      const r = raw as Partial<FuncEntry>;
      if (r && typeof r === 'object') pushFunc(r.week, r.ability, r.note, r.savedOn);
    });
  }
  // v2 weekly rows: only the ability rating survives, under its new name
  if (Array.isArray(d.weekly)) {
    d.weekly.forEach((raw) => {
      const r = raw as { week?: unknown; goal?: unknown; note?: unknown };
      if (r && typeof r === 'object') pushFunc(r.week, r.goal, r.note, undefined);
    });
  }

  const hypotheses: Omit<Hypothesis, 'id'>[] = [];
  if (Array.isArray(d.hypotheses)) {
    d.hypotheses.forEach((raw) => {
      const h = cleanHypothesis(raw);
      if (h) hypotheses.push(h);
    });
  }

  const protocols: Omit<Protocol, 'id'>[] = [];
  if (Array.isArray(d.protocols)) {
    d.protocols.forEach((raw) => {
      const p = cleanProtocol(raw);
      if (p) protocols.push(p);
    });
  }

  return {
    version: typeof d.version === 'number' ? d.version : 1,
    entries, events, func,
    goal: typeof d.goal === 'string' && d.goal.trim() ? d.goal.trim() : null,
    hypotheses, protocols,
    modifiers: cleanModifiers((d as { modifiers?: unknown }).modifiers),
  };
}

/** A content identity for one event. Local row ids are not stable across
 *  devices, so merging deduplicates conservatively: same kind, same date
 *  and time, same text and reported effect = the same event. */
export function eventKey(ev: Omit<PainEvent, 'id'>): string {
  return [
    ev.date, ev.h, ev.kind, ev.text || '',
    ev.helped != null ? ev.helped : '',
    ev.quality && ev.quality.length ? ev.quality.slice().sort().join('+') : '',
    ev.intervention || '',
    ev.resp || '',
    ev.onset || '', ev.duration || '', ev.spread || '', ev.doing || '',
  ].join('|');
}

/** the incoming events that are NOT already present, deduplicated within
 *  the incoming set as well */
export function dedupeEvents(
  existing: Omit<PainEvent, 'id'>[], incoming: Omit<PainEvent, 'id'>[]
): Omit<PainEvent, 'id'>[] {
  const seen: Record<string, true> = {};
  existing.forEach((ev) => { seen[eventKey(ev)] = true; });
  const out: Omit<PainEvent, 'id'>[] = [];
  incoming.forEach((ev) => {
    const k = eventKey(ev);
    if (seen[k]) return;
    seen[k] = true;
    out.push(ev);
  });
  return out;
}
