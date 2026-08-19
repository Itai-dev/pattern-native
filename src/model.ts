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

/* ── evening questions ──────────────────────────────────────── */

export const EVENING = 17 * 60;
export function nextEveningStep(e: Entry | null, minutes: number): 'capacity' | 'impact' | null {
  if (minutes < EVENING || !e) return null;
  if (e.cap == null) return 'capacity';
  if (e.factors == null) return 'impact';
  return null;
}
