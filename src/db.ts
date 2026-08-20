/**
 * Persistence — a thin SQLite wrapper around the pure model.
 * One row per day; moments and tags travel as JSON columns, which keeps
 * the schema identical in spirit to the PWA's localStorage shape and
 * makes backup import/export a straight pass through model.cleanBackup.
 * All access is synchronous (expo-sqlite's sync API): the store is tiny
 * — a year of daily use is a few hundred rows.
 */
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import {
  Entries, Entry, EventKind, PainEvent, WeeklyEntry,
  applyMoment, cleanBackup, cleanEntry, cleanQuality, removeMoment, syncDayPain,
} from './model';

let db: SQLiteDatabase | null = null;

function conn(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('pattern.db');
    db.execSync(
      'CREATE TABLE IF NOT EXISTS days (' +
      'date TEXT PRIMARY KEY, pain INTEGER NOT NULL, cap INTEGER, ' +
      'note TEXT NOT NULL DEFAULT "", factors TEXT, logs TEXT)'
    );
    // preferences live beside the entries — one file to back up, one to delete
    db.execSync('CREATE TABLE IF NOT EXISTS prefs (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    // flares, treatments and notable moments — the Character and Tried answers
    db.execSync(
      'CREATE TABLE IF NOT EXISTS events (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, h INTEGER NOT NULL, ' +
      'kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT "", quality TEXT, helped INTEGER)'
    );
    // one row per rated week: PEG + the function-goal ability
    db.execSync(
      'CREATE TABLE IF NOT EXISTS weekly (' +
      'week TEXT PRIMARY KEY, pegPain INTEGER NOT NULL, pegEnjoy INTEGER NOT NULL, ' +
      'pegActivity INTEGER NOT NULL, goal INTEGER, note TEXT NOT NULL DEFAULT "")'
    );
  }
  return db;
}

/* ── preferences (small JSON values, never entry data) ─────── */

export function getPref<T>(key: string, fallback: T): T {
  const r = conn().getFirstSync<{ v: string }>('SELECT v FROM prefs WHERE k = ?', key);
  if (!r) return fallback;
  try { return JSON.parse(r.v) as T; } catch { return fallback; }
}

export function setPref(key: string, value: unknown): void {
  conn().runSync('INSERT OR REPLACE INTO prefs (k, v) VALUES (?, ?)', key, JSON.stringify(value));
}

interface Row { date: string; pain: number; cap: number | null; note: string; factors: string | null; logs: string | null }

function rowToEntry(r: Row): Entry {
  const e: Entry = { pain: r.pain, cap: r.cap, note: r.note };
  if (r.factors != null) { try { e.factors = JSON.parse(r.factors); } catch {} }
  if (r.logs != null) { try { e.logs = JSON.parse(r.logs); } catch {} }
  return e;
}

function put(date: string, e: Entry): void {
  conn().runSync(
    'INSERT OR REPLACE INTO days (date, pain, cap, note, factors, logs) VALUES (?, ?, ?, ?, ?, ?)',
    date, e.pain, e.cap, e.note,
    e.factors ? JSON.stringify(e.factors) : null,
    e.logs ? JSON.stringify(e.logs) : null
  );
}

export function getDay(date: string): Entry | null {
  const r = conn().getFirstSync<Row>('SELECT * FROM days WHERE date = ?', date);
  return r ? rowToEntry(r) : null;
}

export function getAll(): Entries {
  const out: Entries = {};
  conn().getAllSync<Row>('SELECT * FROM days').forEach((r) => { out[r.date] = rowToEntry(r); });
  return out;
}

export function countDays(): number {
  const r = conn().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM days');
  return r ? r.n : 0;
}

/** write one moment into a day; returns the updated entry */
export function writeMoment(
  date: string, h: number, pain: number,
  loc?: string[] | null, q?: string[] | null
): Entry {
  const e = applyMoment(getDay(date), h, pain, loc, q);
  put(date, e);
  return e;
}

/** backfill a whole past day: one number, no time claimed. Existing
 *  moments keep the peak rule in charge, exactly like the PWA. */
export function writeDayValue(date: string, pain: number): Entry {
  const prev = getDay(date);
  const e: Entry = { pain, cap: prev ? prev.cap : null, note: prev ? prev.note : '' };
  if (prev && prev.factors) e.factors = prev.factors;
  if (prev && prev.logs) { e.logs = prev.logs; syncDayPain(e); }
  put(date, e);
  return e;
}

export function setCap(date: string, cap: number): void {
  const e = getDay(date);
  if (!e) return;
  e.cap = cap;
  put(date, e);
}

export function setFactors(date: string, factors: string[]): void {
  const e = getDay(date);
  if (!e) return;
  e.factors = factors.slice(); // [] is an answer — it stops the evening re-ask
  put(date, e);
}

export function setNote(date: string, note: string): void {
  const e = getDay(date);
  if (!e) return;
  e.note = note;
  put(date, e);
}

/** remove one moment; the day itself goes when nothing anchors it */
export function dropMoment(date: string, h: number): Entry | null {
  const prev = getDay(date);
  if (!prev) return null;
  const e = removeMoment(prev, h);
  if (e) put(date, e);
  else conn().runSync('DELETE FROM days WHERE date = ?', date);
  return e;
}

/* ── events ─────────────────────────────────────────────────── */

interface EventRow { id: number; date: string; h: number; kind: string; text: string; quality: string | null; helped: number | null }

function rowToEvent(r: EventRow): PainEvent {
  const ev: PainEvent = { id: r.id, date: r.date, h: r.h, kind: r.kind as EventKind, text: r.text };
  if (r.quality != null) { try { ev.quality = JSON.parse(r.quality); } catch {} }
  if (r.helped != null) ev.helped = r.helped;
  return ev;
}

export function addEvent(ev: Omit<PainEvent, 'id'>): void {
  conn().runSync(
    'INSERT INTO events (date, h, kind, text, quality, helped) VALUES (?, ?, ?, ?, ?, ?)',
    ev.date, ev.h, ev.kind, ev.text,
    ev.quality && ev.quality.length ? JSON.stringify(ev.quality) : null,
    ev.helped != null ? ev.helped : null
  );
}

export function getEvents(): PainEvent[] {
  return conn().getAllSync<EventRow>('SELECT * FROM events ORDER BY date, h').map(rowToEvent);
}

export function dropEvent(id: number): void {
  conn().runSync('DELETE FROM events WHERE id = ?', id);
}

/* ── the week ───────────────────────────────────────────────── */

interface WeekRow { week: string; pegPain: number; pegEnjoy: number; pegActivity: number; goal: number | null; note: string }

export function putWeekly(w: WeeklyEntry): void {
  conn().runSync(
    'INSERT OR REPLACE INTO weekly (week, pegPain, pegEnjoy, pegActivity, goal, note) VALUES (?, ?, ?, ?, ?, ?)',
    w.week, w.pegPain, w.pegEnjoy, w.pegActivity, w.goal != null ? w.goal : null, w.note || ''
  );
}

export function getWeekly(): WeeklyEntry[] {
  return conn().getAllSync<WeekRow>('SELECT * FROM weekly ORDER BY week').map((r) => ({
    week: r.week, pegPain: r.pegPain, pegEnjoy: r.pegEnjoy, pegActivity: r.pegActivity,
    goal: r.goal, note: r.note,
  }));
}

/* ── the function goal ──────────────────────────────────────── */

export function getGoal(): string | null {
  return getPref<string | null>('goal.text', null);
}
export function setGoal(text: string): void {
  setPref('goal.text', text.trim() || null);
}

/* ── backup ─────────────────────────────────────────────────── */

/** import a backup: the web app's v1 (entries only) or native v2 (entries +
 *  events + weekly + goal). Returns days imported, -1 on unreadable input. */
export function importBackup(json: string): number {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return -1; }
  const incoming = cleanBackup(data);
  const keys = Object.keys(incoming);
  const c = conn();
  c.withTransactionSync(() => {
    keys.forEach((k) => put(k, incoming[k]));
    const d = data as { events?: unknown; weekly?: unknown; goal?: unknown };
    if (Array.isArray(d.events)) {
      d.events.forEach((raw) => {
        const r = raw as Partial<PainEvent>;
        if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
        if (typeof r.h !== 'number' || r.h < 0 || r.h > 1439) return;
        if (r.kind !== 'flare' && r.kind !== 'treatment' && r.kind !== 'activity') return;
        addEvent({
          date: r.date, h: Math.round(r.h), kind: r.kind,
          text: typeof r.text === 'string' ? r.text : '',
          quality: cleanQuality(r.quality),
          helped: typeof r.helped === 'number' && r.helped >= 0 && r.helped <= 10 ? Math.round(r.helped) : null,
        });
      });
    }
    if (Array.isArray(d.weekly)) {
      d.weekly.forEach((raw) => {
        const r = raw as Partial<WeeklyEntry>;
        const okNum = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 10;
        if (typeof r.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.week)) return;
        if (!okNum(r.pegPain) || !okNum(r.pegEnjoy) || !okNum(r.pegActivity)) return;
        putWeekly({
          week: r.week,
          pegPain: Math.round(r.pegPain), pegEnjoy: Math.round(r.pegEnjoy), pegActivity: Math.round(r.pegActivity),
          goal: okNum(r.goal) ? Math.round(r.goal) : null,
          note: typeof r.note === 'string' ? r.note : '',
        });
      });
    }
    if (typeof d.goal === 'string' && d.goal.trim()) setGoal(d.goal);
  });
  return keys.length;
}

/** export everything; version 2 carries events, weekly and the goal, and
 *  stays a superset of the web app's shape so it can restore there too */
export function exportBackup(todayIso: string): string {
  return JSON.stringify({
    app: 'pattern', version: 2, exported: todayIso,
    entries: getAll(), events: getEvents(), weekly: getWeekly(), goal: getGoal(),
  }, null, 2);
}

export function deleteAll(): void {
  const c = conn();
  c.withTransactionSync(() => {
    c.runSync('DELETE FROM days');
    c.runSync('DELETE FROM events');
    c.runSync('DELETE FROM weekly');
    c.runSync('DELETE FROM prefs');
  });
}

/** dev helper: normalize a single raw entry through the model (used by seeds) */
export function putClean(date: string, raw: unknown): void {
  const e = cleanEntry(raw);
  if (e) put(date, e);
}
