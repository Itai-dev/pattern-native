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
 *  - removing a day's only moment removes the day, unless words anchor it.
 *
 * Pain values are integers 0–10 everywhere. The labels and formatting for
 * them live in painScale.ts, which is the single definition of the scale.
 */
import { normalizePain } from './painScale';

export interface Moment {
  /** minutes since midnight, 0–1439 — when the log actually happened */
  h: number;
  pain: number;
  loc?: string[];
  /** pain-quality words — the SOCRATES "Character" answer, per moment */
  q?: string[];
}

export interface Entry {
  pain: number;
  cap: number | null;
  note: string;
  logs?: Moment[];
  factors?: string[];
}

export type Entries = Record<string, Entry>; // key: 'YYYY-MM-DD'

/* ── tag vocabularies ─────────────────────────────────────────
   The id lists are the storage vocabulary; display names live with the
   screens. Same ids as the PWA so backups round-trip both ways. */

export const LOC_NAMES: Record<string, string> = {
  head: 'Head', neck: 'Neck', shoulders: 'Shoulders', upperBack: 'Upper back',
  lowerBack: 'Lower back', arms: 'Arms', hands: 'Hands', chest: 'Chest',
  belly: 'Belly', hips: 'Hips', legs: 'Legs', knees: 'Knees', feet: 'Feet',
  allOver: 'All over',
};
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

export function cleanLogs(l: unknown): Moment[] | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const out: Moment[] = [];
  const push = (h: unknown, pain: unknown, loc?: unknown, q?: unknown) => {
    if (typeof pain !== 'number' || pain < 0 || pain > 10) return;
    if (typeof h !== 'number' || h < 0 || h > 1439) return;
    const v: Moment = { h: Math.round(h), pain: Math.round(pain) };
    const lc = cleanIds(loc, LOCIDS);
    if (lc) v.loc = lc;
    const qc = cleanIds(q, QUALITYIDS);
    if (qc) v.q = qc;
    out.push(v);
  };
  if (Array.isArray(l)) {
    l.forEach((v) => { if (v) push(v.h, v.pain, v.loc, v.q); });
  } else {
    (['m', 'd', 'e'] as const).forEach((s) => {
      const slot = (l as Record<string, { pain?: unknown }>)[s];
      if (slot) push(LEGACYSLOT[s], slot.pain);
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

/** normalize one raw imported day into a clean Entry, or null to skip */
export function cleanEntry(raw: unknown): Entry | null {
  if (!validEntry(raw)) return null;
  const r = raw as { pain: number; cap?: number | null; note?: unknown; factors?: unknown; logs?: unknown };
  const e: Entry = {
    pain: Math.round(r.pain),
    cap: r.cap == null ? null : Math.round(r.cap),
    note: typeof r.note === 'string' ? r.note : '',
  };
  const fc = cleanFactors(r.factors);
  if (fc) e.factors = fc;
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
  return e;
}

/** write one moment; edit-in-place when a moment at `h` exists */
export function applyMoment(
  prev: Entry | null, h: number, pain: number,
  loc?: string[] | null, q?: string[] | null
): Entry {
  const prevLogs = (prev && prev.logs) || [];
  const prevFloor = prev && prev.pain != null && prev.pain > (prevLogs.length ? peakOf(prevLogs) : -1)
    ? prev.pain : null;
  const e = carryDay(prev, prev && prev.pain != null ? prev.pain : pain);
  const logs = prevLogs.slice();
  const moment: Moment = { h, pain };
  if (loc && loc.length) moment.loc = loc.slice();
  if (q && q.length) moment.q = q.slice();
  const i = logs.findIndex((l) => l.h === h);
  if (i >= 0) logs[i] = moment; else logs.push(moment);
  logs.sort((a, b) => a.h - b.h);
  e.logs = logs;
  syncDayPain(e);
  if (prevFloor != null && prevFloor > e.pain) e.pain = prevFloor;
  return e;
}

/** remove the moment at `h`; null = the whole day goes (nothing anchors it) */
export function removeMoment(prev: Entry, h: number): Entry | null {
  const kept = (prev.logs || []).filter((l) => l.h !== h);
  if (kept.length) {
    const e: Entry = { ...prev, logs: kept };
    return syncDayPain(e);
  }
  if (prev.note) {
    const e: Entry = { ...prev };
    delete e.logs;
    return e;
  }
  return null;
}

/* ── day-fill geometry (shared by map, day sheet, journal) ──── */

/** 06:00 is always the rim and 22:00 always the core — absolute, so the
 *  same hour lands at the same depth on every day */
export const DAYSTART = 6 * 60, DAYEND = 22 * 60;
export function radiusFor(h: number): number {
  const r = ((DAYEND - h) / (DAYEND - DAYSTART)) * 100;
  return Math.max(0, Math.min(100, r));
}

/* ── the mark ───────────────────────────────────────────────
   The app icon's recipe — a saturated rim easing into a pale core — used
   for the brand mark only. Logged days do NOT use it: one log is a flat
   colour, and the gradient is what several logs make together. Native has
   no inset shadows, so easing is drawn as nested rounded squares. */
export const GLOWLIFT = 0.55;
export const GLOWSTEPS = 7;

export function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * t);
  return '#' + [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
    .map((v) => ('0' + v.toString(16)).slice(-2)).join('');
}

/** ink that stays legible on a given background, by real luminance */
export function inkForBg(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? '#000000' : '#FFFFFF';
}

export interface Layer { color: string; inset: number }

/** steps drawn between two neighbouring moments so stacked solids read as
 *  one gradient — native's stand-in for a blurred shadow */
export const BLENDSTEPS = 8;

export function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const at = (n: number, s: number) => (n >> s) & 255;
  const m = (s: number) => Math.round(at(na, s) + (at(nb, s) - at(na, s)) * t);
  return '#' + [m(16), m(8), m(0)].map((v) => ('0' + v.toString(16)).slice(-2)).join('');
}

/** one log as a square gradient: concentric squares, rim colour → pale core.
 *  `from` is the inset the glow starts at, `half` the box's half-edge. */
export function glowLayers(hex: string, half: number, from = 0): Layer[] {
  const span = (half - from) * 0.86; // the core keeps a flat pale centre
  const out: Layer[] = [];
  for (let i = 0; i < GLOWSTEPS; i++) {
    const t = i / (GLOWSTEPS - 1);
    out.push({ color: lighten(hex, GLOWLIFT * t), inset: from + span * t });
  }
  return out;
}

export interface Band { color: string; depth: number }
/** concentric square bands, outermost first; [] = paint the day value solid.
 *  `half` is half the box edge in px; depth is inset from the edge. */
export function dayBands(e: Entry, half: number, ramp: readonly string[]): Band[] {
  const logs = e.logs || [];
  if (logs.length < 2) return [];
  if (radiusFor(logs[0].h) === radiusFor(logs[logs.length - 1].h)) return [];
  const bands: Band[] = [{ color: ramp[logs[0].pain], depth: 0 }];
  for (let i = 1; i < logs.length; i++) {
    bands.push({ color: ramp[logs[i].pain], depth: ((100 - radiusFor(logs[i].h)) / 100) * half });
  }
  return bands;
}

/** The full paint order for one day cell, outermost layer first.
 *  ONE log is a flat colour. The gradient is what a second and third log
 *  make: each moment lays down its own solid colour and they blend —
 *  earliest at the rim, latest at the core. A day touched once looks like
 *  one decision; a day followed through the hours earns the depth. */
export function dayLayers(e: Entry, half: number, ramp: readonly string[]): Layer[] {
  const bands = dayBands(e, half, ramp);
  if (!bands.length) return [{ color: ramp[e.pain], inset: 0 }];
  /* CSS gets this blend from a blurred shadow; native has to draw it, so
     each pair of neighbouring moments is walked in BLENDSTEPS. */
  const out: Layer[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const from = bands[i], to = bands[i + 1];
    for (let s = 0; s < BLENDSTEPS; s++) {
      const t = s / BLENDSTEPS;
      out.push({ color: mixHex(from.color, to.color, t), inset: from.depth + (to.depth - from.depth) * t });
    }
  }
  out.push({ color: bands[bands.length - 1].color, inset: bands[bands.length - 1].depth });
  return out;
}

/** the colour at the centre of the day's fill */
export function centerPain(e: Entry): number {
  const logs = e.logs || [];
  if (logs.length < 2) return e.pain;
  if (radiusFor(logs[0].h) === radiusFor(logs[logs.length - 1].h)) return e.pain;
  return logs[logs.length - 1].pain;
}

/* ── events: flares, treatments, notable moments ─────────────
   The event log answers the two questions every clinician asks that the
   daily check-in cannot: what does it feel like (Character), and what have
   you tried and did it help. */

export type EventKind = 'flare' | 'treatment' | 'activity' | 'sleep' | 'other';

export interface PainEvent {
  id?: number;
  date: string;      // YYYY-MM-DD
  h: number;         // minutes since midnight
  kind: EventKind;
  text: string;
  /** pain-quality words — the SOCRATES "Character" answer */
  quality?: string[];
  /** treatments only: the user's own impression of effect, 0–10.
   *  A patient report, never the app's assessment. */
  helped?: number | null;
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

/* ── function: ability at the activity you want back ─────────
   A separate 0–10 scale, stored apart from pain and never averaged with
   it. Asked at most once a week, updatable by hand. */

export interface FuncEntry {
  week: string;    // the Monday of the week rated, YYYY-MM-DD
  ability: number; // 0 = not able at all, 10 = fully able
  note?: string;
}

export function mondayOf(dateIso: string): string {
  const d = dateFromISO(dateIso);
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift);
  return iso(d);
}

/** due when this week has no rating yet — one ask per week, no nagging */
export function funcDue(entries: FuncEntry[], todayIso: string, hasActivity: boolean): boolean {
  if (!hasActivity) return false;
  const monday = mondayOf(todayIso);
  return !entries.some((f) => f.week === monday);
}

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
  treatment: 'Treatment or medication',
  activity: 'Unusual activity',
  sleep: 'Poor sleep',
  other: 'Something else',
};
export const EVENT_KINDS = Object.keys(EVENT_LABELS) as EventKind[];

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

/* ── the clinician report ────────────────────────────────────
   Ordered the way clinicians assess, stating observations as observations:
   what was recorded, over how many days, with co-occurrence named as
   co-occurrence and never as cause. */

export interface ReportInput {
  entries: Entries;
  events: PainEvent[];
  func: FuncEntry[];
  goalText: string | null;
  todayIso: string;
  windowDays: number; // typically 90
}

function fmtDate(iso_: string): string {
  const d = dateFromISO(iso_);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getDate() + ' ' + M[d.getMonth()];
}

/** how many logged days the report covers — surfaced in the UI so a short
 *  history is never mistaken for a reliable pattern */
export function reportDayCount(entries: Entries, todayIso: string, windowDays: number): number {
  const start = dateFromISO(todayIso);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = iso(start);
  return Object.keys(entries).filter((k) => k >= startIso && k <= todayIso).length;
}

export function buildReport(inp: ReportInput): string {
  const { entries, events, func, goalText, todayIso, windowDays } = inp;
  const start = dateFromISO(todayIso);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = iso(start);

  const days = Object.keys(entries)
    .filter((k) => k >= startIso && k <= todayIso)
    .sort()
    .map((k) => ({ k, e: entries[k] }));
  if (!days.length) return '';

  const L: string[] = [];
  const avgOf = (a: number[]) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10;
  const dayAverages = days
    .map((d) => dailyAverage(d.e))
    .filter((v): v is number => v != null);
  const totalCheckins = days.reduce((s, d) => s + checkinCount(d.e), 0);

  L.push('PATTERN — SELF-RECORDED PAIN SUMMARY');
  L.push(fmtDate(days[0].k) + ' to ' + fmtDate(todayIso));
  L.push(days.length + ' logged days · ' + totalCheckins + ' check-ins · scale 0-10, 0 = no pain');
  if (days.length < 14) {
    L.push('NOTE: a short record — enough to show what was logged, not');
    L.push('enough to establish a pattern.');
  }
  L.push('');

  L.push('PAIN INTENSITY OVER TIME (daily averages)');
  L.push('  Overall average ' + avgOf(dayAverages) +
    ' · highest day ' + Math.max.apply(null, dayAverages) +
    ' · lowest day ' + Math.min.apply(null, dayAverages));
  L.push('  Days averaging 7 or above: ' + dayAverages.filter((v) => v >= 7).length +
    ' of ' + days.length);
  if (days.length >= 14) {
    const half = Math.floor(days.length / 2);
    const a = avgOf(dayAverages.slice(0, half));
    const b = avgOf(dayAverages.slice(half));
    const delta = Math.round((b - a) * 10) / 10;
    L.push('  First half ' + a + ' vs second half ' + b +
      (Math.abs(delta) >= 0.5 ? (delta > 0 ? ' (higher)' : ' (lower)') : ' (little change)'));
  }
  L.push('');

  if (goalText) {
    L.push('FUNCTION — "' + goalText + '" (self-rated ability 0-10, weekly)');
    const t = funcTrend(func);
    if (t) {
      L.push('  ' + t.first.ability + ' (' + fmtDate(t.first.week) + ') to ' +
        t.last.ability + ' (' + fmtDate(t.last.week) + ')');
    } else if (func.length === 1) {
      L.push('  ' + func[0].ability + ' (' + fmtDate(func[0].week) + ')');
    } else {
      L.push('  Activity chosen; no weekly ratings recorded yet.');
    }
    L.push('');
  }

  const locDays: Record<string, number> = {};
  days.forEach((d) => {
    const seen: Record<string, boolean> = {};
    logsOf(d.e).forEach((l) => (l.loc || []).forEach((id) => { seen[id] = true; }));
    Object.keys(seen).forEach((id) => { locDays[id] = (locDays[id] || 0) + 1; });
  });
  const topLocs = Object.keys(locDays).sort((a, b) => locDays[b] - locDays[a]).slice(0, 5);
  if (topLocs.length) {
    L.push('PAIN LOCATIONS (days noted)');
    L.push('  ' + topLocs.map((id) => (LOC_NAMES[id] || id) + ' ' + locDays[id]).join(', '));
    L.push('');
  }

  const qual: Record<string, number> = {};
  days.forEach((d) => logsOf(d.e).forEach((l) => (l.q || []).forEach((q) => {
    qual[q] = (qual[q] || 0) + 1;
  })));
  const topQual = Object.keys(qual).sort((a, b) => qual[b] - qual[a]).slice(0, 5);
  if (topQual.length) {
    L.push('DESCRIBED AS');
    L.push('  ' + topQual.map((q) => (QUALITY_NAMES[q] || q) + ' x' + qual[q]).join(', '));
    L.push('');
  }

  const inWindow = events.filter((ev) => ev.date >= startIso && ev.date <= todayIso);
  const treatments = inWindow.filter((ev) => ev.kind === 'treatment');
  if (treatments.length) {
    L.push('TREATMENTS RECORDED (patient-reported effect, 0-10)');
    treatments.slice(-8).forEach((ev) => {
      L.push('  ' + fmtDate(ev.date) + ' — ' + (ev.text || 'unspecified') +
        (ev.helped != null ? ' (reported effect ' + ev.helped + ')' : ''));
    });
    L.push('');
  }
  const others = inWindow.filter((ev) => ev.kind !== 'treatment');
  if (others.length) {
    const byKind: Record<string, number> = {};
    others.forEach((ev) => { byKind[ev.kind] = (byKind[ev.kind] || 0) + 1; });
    L.push('OTHER EVENTS RECORDED');
    L.push('  ' + Object.keys(byKind)
      .map((k) => (EVENT_LABELS[k as EventKind] || k) + ' ' + byKind[k]).join(', '));
    L.push('  Recorded as events only. No causal relationship is implied.');
    L.push('');
  }

  L.push('Self-recorded by the patient using Pattern, a wellness journal.');
  L.push('Not a medical device. Does not diagnose, treat, or predict.');
  return L.join('\n');
}
