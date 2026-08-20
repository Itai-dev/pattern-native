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
  Entries, Entry, EVENT_KINDS, EventKind, FuncEntry, PainEvent,
  applyMoment, cleanBackup, cleanEntry, cleanQuality, migrateEntries,
  removeMoment, syncDayPain,
} from './model';
import { SCALE_VERSION } from './painScale';

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
      'kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT "", quality TEXT, helped INTEGER, linked INTEGER)'
    );
    /* DEPRECATED. An earlier build kept a three-item interference score
       here; that wording was not ours to ship and is gone. The table is
       retained only so v2 backups still restore — nothing writes to it. */
    db.execSync(
      'CREATE TABLE IF NOT EXISTS weekly (' +
      'week TEXT PRIMARY KEY, pegPain INTEGER NOT NULL, pegEnjoy INTEGER NOT NULL, ' +
      'pegActivity INTEGER NOT NULL, goal INTEGER, note TEXT NOT NULL DEFAULT "")'
    );
    /* function check-ins: ability at the named activity, on its own 0–10
       scale and stored apart from pain so the two can never be mixed. */
    db.execSync(
      'CREATE TABLE IF NOT EXISTS func (' +
      'week TEXT PRIMARY KEY, ability INTEGER NOT NULL, note TEXT NOT NULL DEFAULT "")'
    );
    migrateWeeklyToFunc(db);
    migratePainScale(db);
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

interface EventRow {
  id: number; date: string; h: number; kind: string; text: string;
  quality: string | null; helped: number | null; linked: number | null;
}

function rowToEvent(r: EventRow): PainEvent {
  const ev: PainEvent = { id: r.id, date: r.date, h: r.h, kind: r.kind as EventKind, text: r.text };
  if (r.quality != null) { try { ev.quality = JSON.parse(r.quality); } catch {} }
  if (r.helped != null) ev.helped = r.helped;
  if (r.linked != null) ev.linked = r.linked;
  return ev;
}

export function addEvent(ev: Omit<PainEvent, 'id'>): void {
  conn().runSync(
    'INSERT INTO events (date, h, kind, text, quality, helped, linked) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ev.date, ev.h, ev.kind, ev.text,
    ev.quality && ev.quality.length ? JSON.stringify(ev.quality) : null,
    ev.helped != null ? ev.helped : null,
    ev.linked != null ? ev.linked : null
  );
}

/** events recorded on one day, for the day detail */
export function getEventsFor(date: string): PainEvent[] {
  return conn()
    .getAllSync<EventRow>('SELECT * FROM events WHERE date = ? ORDER BY h', date)
    .map(rowToEvent);
}

export function getEvents(): PainEvent[] {
  return conn().getAllSync<EventRow>('SELECT * FROM events ORDER BY date, h').map(rowToEvent);
}

export function dropEvent(id: number): void {
  conn().runSync('DELETE FROM events WHERE id = ?', id);
}

/* ── the week ───────────────────────────────────────────────── */

interface FuncRow { week: string; ability: number; note: string }

/* The weekly table briefly held a three-item pain-interference score
   alongside an ability rating. The score is gone (its wording was not
   ours to ship); the ability rating is the thing worth keeping, so any
   row that carried one is copied into `func` and the old table is left
   untouched for backup compatibility. Runs once — rows already present
   in `func` win, so a second pass changes nothing. */
function migrateWeeklyToFunc(database: SQLiteDatabase): void {
  try {
    const rows = database.getAllSync<{ week: string; goal: number | null; note: string }>(
      'SELECT week, goal, note FROM weekly WHERE goal IS NOT NULL'
    );
    rows.forEach((r) => {
      database.runSync(
        'INSERT OR IGNORE INTO func (week, ability, note) VALUES (?, ?, ?)',
        r.week, r.goal as number, r.note || ''
      );
    });
  } catch {
    // no weekly table on a fresh install — nothing to carry forward
  }
}

/* Pain has always been an integer 0–10, so the v1 → v2 scale change moved
   the words and not the numbers. This still runs once, to coerce anything
   malformed (a decimal from a hand-edited backup, an out-of-range value)
   into the domain, and stamps the version so it never repeats. */
function migratePainScale(database: SQLiteDatabase): void {
  try {
    const row = database.getFirstSync<{ v: string }>(
      'SELECT v FROM prefs WHERE k = ?', 'scale.version'
    );
    const at = row ? JSON.parse(row.v) : 0;
    if (at >= SCALE_VERSION) return;

    const rows = database.getAllSync<Row>('SELECT * FROM days');
    const before: Entries = {};
    rows.forEach((r) => { before[r.date] = rowToEntry(r); });
    const { entries, corrected } = migrateEntries(before);

    database.withTransactionSync(() => {
      if (corrected > 0) {
        Object.keys(entries).forEach((k) => {
          const e = entries[k];
          database.runSync(
            'INSERT OR REPLACE INTO days (date, pain, cap, note, factors, logs) VALUES (?, ?, ?, ?, ?, ?)',
            k, e.pain, e.cap, e.note,
            e.factors ? JSON.stringify(e.factors) : null,
            e.logs ? JSON.stringify(e.logs) : null
          );
        });
      }
      database.runSync(
        'INSERT OR REPLACE INTO prefs (k, v) VALUES (?, ?)',
        'scale.version', JSON.stringify(SCALE_VERSION)
      );
    });
  } catch {
    // a fresh install has nothing to migrate
  }
}

export function putFunc(f: FuncEntry): void {
  conn().runSync(
    'INSERT OR REPLACE INTO func (week, ability, note) VALUES (?, ?, ?)',
    f.week, f.ability, f.note || ''
  );
}

export function getFunc(): FuncEntry[] {
  return conn().getAllSync<FuncRow>('SELECT * FROM func ORDER BY week')
    .map((r) => ({ week: r.week, ability: r.ability, note: r.note }));
}

/* ── the function goal ──────────────────────────────────────── */

export function getGoal(): string | null {
  return getPref<string | null>('goal.text', null);
}
export function setGoal(text: string): void {
  setPref('goal.text', text.trim() || null);
}

/* ── backup ─────────────────────────────────────────────────── */

/** Restore a backup, MERGING into what is already here — a restored day
 *  replaces that same day, and every other day is left alone. Accepts the
 *  web app's v1 (entries only), native v2 (with events and the retired
 *  weekly rows) and v3 (with function check-ins). Returns days imported,
 *  or -1 if the file could not be read as a Pattern backup. */
export function importBackup(json: string): number {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return -1; }
  const incoming = cleanBackup(data);
  const d = data as {
    entries?: unknown; events?: unknown; weekly?: unknown; func?: unknown; goal?: unknown;
  };
  // a file with no recognisable section at all is not a Pattern backup
  if (!d || typeof d !== 'object' || (d.entries === undefined && d.func === undefined && d.events === undefined)) {
    return -1;
  }
  const keys = Object.keys(incoming);
  const okNum = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 10;
  const c = conn();
  c.withTransactionSync(() => {
    keys.forEach((k) => put(k, incoming[k]));
    if (Array.isArray(d.events)) {
      d.events.forEach((raw) => {
        const r = raw as Partial<PainEvent>;
        if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return;
        if (typeof r.h !== 'number' || r.h < 0 || r.h > 1439) return;
        if (EVENT_KINDS.indexOf(r.kind as EventKind) < 0) return;
        addEvent({
          date: r.date, h: Math.round(r.h), kind: r.kind as EventKind,
          text: typeof r.text === 'string' ? r.text : '',
          quality: cleanQuality(r.quality),
          helped: okNum(r.helped) ? Math.round(r.helped) : null,
        });
      });
    }
    // v3 function check-ins
    if (Array.isArray(d.func)) {
      d.func.forEach((raw) => {
        const r = raw as Partial<FuncEntry>;
        if (typeof r.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.week)) return;
        if (!okNum(r.ability)) return;
        putFunc({
          week: r.week, ability: Math.round(r.ability),
          note: typeof r.note === 'string' ? r.note : '',
        });
      });
    }
    // v2 weekly rows: only the ability rating survives, under its new name
    if (Array.isArray(d.weekly)) {
      d.weekly.forEach((raw) => {
        const r = raw as { week?: unknown; goal?: unknown; note?: unknown };
        if (typeof r.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.week)) return;
        if (!okNum(r.goal)) return;
        putFunc({
          week: r.week, ability: Math.round(r.goal),
          note: typeof r.note === 'string' ? r.note : '',
        });
      });
    }
    if (typeof d.goal === 'string' && d.goal.trim()) setGoal(d.goal);
  });
  return keys.length;
}

/** Export everything, versioned. v3 carries entries, events, function
 *  check-ins and the activity, and records the pain-scale version so a
 *  future reader knows which label set the numbers were captured under. */
export function exportBackup(todayIso: string): string {
  return JSON.stringify({
    app: 'pattern', version: 3, scaleVersion: SCALE_VERSION, exported: todayIso,
    entries: getAll(), events: getEvents(), func: getFunc(), goal: getGoal(),
  }, null, 2);
}

export function deleteAll(): void {
  const c = conn();
  c.withTransactionSync(() => {
    c.runSync('DELETE FROM days');
    c.runSync('DELETE FROM events');
    c.runSync('DELETE FROM weekly');
    c.runSync('DELETE FROM func');
    c.runSync('DELETE FROM prefs');
  });
}

/** dev helper: normalize a single raw entry through the model (used by seeds) */
export function putClean(date: string, raw: unknown): void {
  const e = cleanEntry(raw);
  if (e) put(date, e);
}
