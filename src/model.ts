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

/* ── backups: validation first, writes second ────────────────
   Restoring must never destroy current data before the incoming file has
   been fully validated, so validation is a pure pass over the parsed JSON
   that produces a clean, typed picture of what the file holds — or a
   plain refusal. The caller then chooses REPLACE or MERGE. */

export const BACKUP_VERSION = 4;

export interface ValidBackup {
  version: number;
  entries: Entries;
  events: Omit<PainEvent, 'id'>[];
  func: FuncEntry[];
  goal: string | null;
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
  };
  // a file with no recognisable section at all is not a Pattern backup
  if (d.entries === undefined && d.func === undefined && d.events === undefined) return null;

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

  return {
    version: typeof d.version === 'number' ? d.version : 1,
    entries, events, func,
    goal: typeof d.goal === 'string' && d.goal.trim() ? d.goal.trim() : null,
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
