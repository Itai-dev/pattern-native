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
  Entries, Entry, applyMoment, cleanBackup, cleanEntry, removeMoment, syncDayPain,
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
  }
  return db;
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
export function writeMoment(date: string, h: number, pain: number, loc?: string[] | null): Entry {
  const e = applyMoment(getDay(date), h, pain, loc);
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

/** import a PWA backup (current or legacy shape); returns days imported */
export function importBackup(json: string): number {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return -1; }
  const incoming = cleanBackup(data);
  const keys = Object.keys(incoming);
  const c = conn();
  c.withTransactionSync(() => {
    keys.forEach((k) => put(k, incoming[k]));
  });
  return keys.length;
}

/** export in the exact shape the PWA writes, so restores go both ways */
export function exportBackup(todayIso: string): string {
  return JSON.stringify({ app: 'pattern', version: 1, exported: todayIso, entries: getAll() }, null, 2);
}

export function deleteAll(): void {
  conn().runSync('DELETE FROM days');
}

/** dev helper: normalize a single raw entry through the model (used by seeds) */
export function putClean(date: string, raw: unknown): void {
  const e = cleanEntry(raw);
  if (e) put(date, e);
}
