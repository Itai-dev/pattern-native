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
 */

export interface Moment {
  /** minutes since midnight, 0–1439 — when the log actually happened */
  h: number;
  pain: number;
  loc?: string[];
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
  const push = (h: unknown, pain: unknown, loc?: unknown) => {
    if (typeof pain !== 'number' || pain < 0 || pain > 10) return;
    if (typeof h !== 'number' || h < 0 || h > 1439) return;
    const v: Moment = { h: Math.round(h), pain: Math.round(pain) };
    const lc = cleanIds(loc, LOCIDS);
    if (lc) v.loc = lc;
    out.push(v);
  };
  if (Array.isArray(l)) {
    l.forEach((v) => { if (v) push(v.h, v.pain, v.loc); });
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
export function applyMoment(prev: Entry | null, h: number, pain: number, loc?: string[] | null): Entry {
  const prevLogs = (prev && prev.logs) || [];
  const prevFloor = prev && prev.pain != null && prev.pain > (prevLogs.length ? peakOf(prevLogs) : -1)
    ? prev.pain : null;
  const e = carryDay(prev, prev && prev.pain != null ? prev.pain : pain);
  const logs = prevLogs.slice();
  const moment: Moment = { h, pain };
  if (loc && loc.length) moment.loc = loc.slice();
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

export type EventKind = 'flare' | 'treatment' | 'activity';

export interface PainEvent {
  id?: number;
  date: string;      // YYYY-MM-DD
  h: number;         // minutes since midnight
  kind: EventKind;
  text: string;
  /** pain-quality words — the SOCRATES "Character" answer */
  quality?: string[];
  /** treatments only: perceived effect 0–10, null = not yet judged */
  helped?: number | null;
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

/* ── the week: PEG + the function goal ───────────────────────
   PEG (pain average, enjoyment of life, general activity; 0–10 each,
   past week; score = mean) is validated, responsive to change, and freely
   usable — it replaces the daily capacity slider. The goal rating is the
   IMMPACT-style function question: ability at the one activity the person
   wants back. */

export interface WeeklyEntry {
  week: string;          // the Monday of the week rated, YYYY-MM-DD
  pegPain: number;
  pegEnjoy: number;
  pegActivity: number;
  goal?: number | null;  // 0–10 ability at the named activity
  note?: string;         // "what seemed to help?"
}

export function pegScore(w: WeeklyEntry): number {
  return Math.round(((w.pegPain + w.pegEnjoy + w.pegActivity) / 3) * 10) / 10;
}

export function mondayOf(dateIso: string): string {
  const d = dateFromISO(dateIso);
  const shift = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift);
  return iso(d);
}

/** the weekly questions are due when the current week has no entry and at
 *  least 4 days of it have passed — late enough to be about this week,
 *  never nagging twice */
export function weeklyDue(weekly: WeeklyEntry[], todayIso: string): boolean {
  const monday = mondayOf(todayIso);
  if (weekly.some((w) => w.week === monday)) return false;
  const dayOfWeek = (dateFromISO(todayIso).getDay() + 6) % 7;
  return dayOfWeek >= 4; // Friday onward
}

/* ── where-step defaults: confirm, not choose ────────────────
   Chronic pain usually lives in the same places. The where step opens with
   the most recent places pre-selected (within a memory horizon), so the
   common case is one confirming tap. */

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

/* ── evening questions (legacy) ──────────────────────────────
   The daily capacity/impact steps were retired 2026-08-20: PEG asks the
   capacity question better, weekly and validated, and impact context moved
   into the flare log where it carries meaning. This stays because historic
   entries still hold cap/factors and the report still reads them. */

export const EVENING = 17 * 60;
export function nextEveningStep(e: Entry | null, minutes: number): 'capacity' | 'impact' | null {
  if (minutes < EVENING || !e) return null;
  if (e.cap == null) return 'capacity';
  if (e.factors == null) return 'impact';
  return null;
}

/* ── the clinician report ────────────────────────────────────
   The app's primary output. One page, ordered the way clinicians assess
   (SOCRATES): severity, site, timing, character, relieving/worsening,
   function, treatments tried. Facts from the user's own records, association
   language only, and short enough to survive a real appointment — the
   patient-data literature is blunt that anything longer gets set aside. */

export interface ReportInput {
  entries: Entries;
  events: PainEvent[];
  weekly: WeeklyEntry[];
  goalText: string | null;
  todayIso: string;
  windowDays: number; // typically 90
}

function fmtDate(iso_: string): string {
  const d = dateFromISO(iso_);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getDate() + ' ' + M[d.getMonth()];
}

export function buildReport(inp: ReportInput): string {
  const { entries, events, weekly, goalText, todayIso, windowDays } = inp;
  const start = dateFromISO(todayIso);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = iso(start);

  const days = Object.keys(entries)
    .filter((k) => k >= startIso && k <= todayIso)
    .sort()
    .map((k) => ({ k, e: entries[k] }));
  if (days.length < 5) return '';

  const L: string[] = [];
  L.push('PATTERN — SELF-LOGGED PAIN SUMMARY');
  L.push(fmtDate(days[0].k) + ' to ' + fmtDate(todayIso) + ' · ' + days.length + ' days logged');
  L.push('');

  // ── Severity ──
  const pains = days.map((d) => d.e.pain);
  const avg = (a: number[]) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10;
  const sevLine: string[] = [];
  sevLine.push('Pain (0-10, self-rated): average ' + avg(pains) +
    ', days at 7+: ' + pains.filter((p) => p >= 7).length);
  const weeks = weekly.filter((w) => w.week >= startIso).sort((a, b) => (a.week < b.week ? -1 : 1));
  if (weeks.length >= 2) {
    const first = weeks[0], last = weeks[weeks.length - 1];
    sevLine.push('PEG (validated 3-item, weekly): ' + pegScore(first) + ' -> ' + pegScore(last) +
      ' (' + fmtDate(first.week) + ' -> ' + fmtDate(last.week) + ')');
  } else if (weeks.length === 1) {
    sevLine.push('PEG (validated 3-item): ' + pegScore(weeks[0]) + ' this week');
  }
  L.push('SEVERITY');
  sevLine.forEach((s) => L.push('  ' + s));
  L.push('');

  // ── Site ──
  const locDays: Record<string, number> = {};
  days.forEach((d) => {
    const seen: Record<string, boolean> = {};
    logsOf(d.e).forEach((l) => (l.loc || []).forEach((id) => { seen[id] = true; }));
    Object.keys(seen).forEach((id) => { locDays[id] = (locDays[id] || 0) + 1; });
  });
  const topLocs = Object.keys(locDays).sort((a, b) => locDays[b] - locDays[a]).slice(0, 4);
  if (topLocs.length) {
    L.push('SITE (days noted)');
    L.push('  ' + topLocs.map((id) => (LOC_NAMES[id] || id) + ' ' + locDays[id]).join(', '));
    L.push('');
  }

  // ── Timing / course ──
  const half = Math.floor(days.length / 2);
  const flares = events.filter((ev) => ev.kind === 'flare' && ev.date >= startIso);
  const course: string[] = [];
  if (days.length >= 14) {
    const a = avg(days.slice(0, half).map((d) => d.e.pain));
    const b = avg(days.slice(half).map((d) => d.e.pain));
    const delta = Math.round((b - a) * 10) / 10;
    course.push('Average pain, first half vs second half of period: ' + a + ' vs ' + b +
      (Math.abs(delta) >= 0.5 ? (delta > 0 ? ' (worse)' : ' (better)') : ' (stable)'));
  }
  if (flares.length) course.push('Flares logged: ' + flares.length);
  if (course.length) {
    L.push('COURSE');
    course.forEach((s) => L.push('  ' + s));
    L.push('');
  }

  // ── Character ──
  const qual: Record<string, number> = {};
  flares.forEach((ev) => (ev.quality || []).forEach((q) => { qual[q] = (qual[q] || 0) + 1; }));
  const topQual = Object.keys(qual).sort((a, b) => qual[b] - qual[a]).slice(0, 4);
  if (topQual.length) {
    L.push('CHARACTER (words chosen during flares)');
    L.push('  ' + topQual.map((q) => (QUALITY_NAMES[q] || q) + ' x' + qual[q]).join(', '));
    L.push('');
  }

  // ── Context noted (association language only) ──
  const facDays: Record<string, number> = {};
  days.forEach((d) => (d.e.factors || []).forEach((f) => { facDays[f] = (facDays[f] || 0) + 1; }));
  const topFac = Object.keys(facDays).sort((a, b) => facDays[b] - facDays[a]).slice(0, 4);
  if (topFac.length) {
    L.push('SELF-MARKED CONTEXT (days noted; association, not cause)');
    L.push('  ' + topFac.map((f) => (FACTOR_NAMES[f] || f) + ' ' + facDays[f]).join(', '));
    L.push('');
  }

  // ── Function ──
  const goalRatings = weeks.filter((w) => w.goal != null);
  if (goalText && goalRatings.length) {
    const first = goalRatings[0], last = goalRatings[goalRatings.length - 1];
    L.push('FUNCTION — "' + goalText + '" (ability 0-10, weekly)');
    L.push('  ' + (goalRatings.length >= 2
      ? first.goal + ' (' + fmtDate(first.week) + ') -> ' + last.goal + ' (' + fmtDate(last.week) + ')'
      : last.goal + ' this week'));
    L.push('');
  }

  // ── Treatments tried ──
  const tried = events.filter((ev) => ev.kind === 'treatment' && ev.date >= startIso);
  if (tried.length) {
    L.push('TRIED (patient-perceived effect, 0-10)');
    tried.slice(-6).forEach((ev) => {
      L.push('  ' + fmtDate(ev.date) + ' — ' + ev.text +
        (ev.helped != null ? ' (helped: ' + ev.helped + ')' : ''));
    });
    L.push('');
  }

  L.push('Recorded by the patient with Pattern, a self-tracking wellness');
  L.push('journal. Not a medical device; does not diagnose, treat, or predict.');
  return L.join('\n');
}
