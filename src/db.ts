/**
 * Persistence — a thin SQLite wrapper around the pure model.
 * One row per day; moments and tags travel as JSON columns, which keeps
 * the schema identical in spirit to the PWA's localStorage shape and
 * makes backup import/export a straight pass through model.cleanBackup.
 * All access is synchronous (expo-sqlite's sync API): the store is tiny
 * — a year of daily use is a few hundred rows.
 */
import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { getMetric } from './metrics';
import { addDays } from './model';
import {
  Answer, BACKUP_VERSION, CONTEXT_VERSION, ContextAnswers, Entries, Entry,
  EventKind, FuncEntry, Hypothesis, PainEvent, Protocol, ProtocolStatus,
  MomentMeta, Response, ValidBackup,
  applyMoment, cleanCtx, cleanEntry, cleanModifiers, dedupeEvents,
  migrateEntries, nowMeta, protocolKey, removeMoment, syncDayPain, validateBackup,
} from './model';
import { SCALE_VERSION } from './painScale';
import { PROTOCOL_REVIEW_DAYS } from './thresholds';

let db: SQLiteDatabase | null = null;

function conn(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('pattern.db');
    db.execSync(
      'CREATE TABLE IF NOT EXISTS days (' +
      'date TEXT PRIMARY KEY, pain INTEGER NOT NULL, cap INTEGER, ' +
      'note TEXT NOT NULL DEFAULT "", factors TEXT, logs TEXT)'
    );
    /* M1 — day-scoped context answers, keyed by metric id. Additive:
       existing rows keep NULL, which reads as "nothing was ever asked",
       because nothing ever was. */
    try { db.execSync('ALTER TABLE days ADD COLUMN ctx TEXT'); } catch {}
    // preferences live beside the entries — one file to back up, one to delete
    db.execSync('CREATE TABLE IF NOT EXISTS prefs (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    // flares, treatments and notable moments — the Character and Tried answers
    db.execSync(
      'CREATE TABLE IF NOT EXISTS events (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, h INTEGER NOT NULL, ' +
      'kind TEXT NOT NULL, text TEXT NOT NULL DEFAULT "", quality TEXT, helped INTEGER, linked INTEGER)'
    );
    /* M7 — what was tried, and how it went. `helped` is untouched on
       every existing row: a 0–10 impression and a four-level response
       are different questions, and no cutpoint between them would be
       anything but invented. Both are stored; the report says which. */
    try { db.execSync('ALTER TABLE events ADD COLUMN intervention TEXT'); } catch {}
    try { db.execSync('ALTER TABLE events ADD COLUMN resp TEXT'); } catch {}

    /* M2 — the hypothesis in the user's own words. Never leaves the
       device, never parsed by anything remote. */
    db.execSync(
      'CREATE TABLE IF NOT EXISTS hypotheses (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, createdOn TEXT NOT NULL, ' +
      'understand TEXT NOT NULL DEFAULT "", harder TEXT NOT NULL DEFAULT "", ' +
      'helps TEXT NOT NULL DEFAULT "")'
    );
    /* M2 — observation periods. One active at a time; editing a factor
       closes the period rather than rewriting what came before. */
    db.execSync(
      'CREATE TABLE IF NOT EXISTS protocols (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL, ' +
      'startDate TEXT NOT NULL, endDate TEXT, reviewOn TEXT NOT NULL, ' +
      'chosenFactor TEXT NOT NULL, secondFactor TEXT NOT NULL, ' +
      'hypothesisId INTEGER, status TEXT NOT NULL)'
    );
    /* M2 — shadow mode. The engine's workings, written down and shown to
       nobody: local only, out of analytics, and out of the ordinary
       export unless the user turns diagnostics on. Three rules are scored
       side by side so the disagreement between them becomes a question
       real data answers, at no risk to the person generating it. */
    db.execSync(
      'CREATE TABLE IF NOT EXISTS shadow_eval (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, computedOn TEXT NOT NULL, ' +
      'protocolId INTEGER, factorId TEXT NOT NULL, wordingVersion INTEGER NOT NULL, ' +
      'relation TEXT NOT NULL, levelA TEXT NOT NULL, levelB TEXT NOT NULL, ' +
      'nA INTEGER NOT NULL, nB INTEGER NOT NULL, ' +
      'meanA REAL NOT NULL, meanB REAL NOT NULL, delta REAL NOT NULL, ' +
      'deltaFirstHalf REAL, deltaSecondHalf REAL, directionStable INTEGER, ' +
      'daysObserved INTEGER NOT NULL, daysMissing INTEGER NOT NULL, ' +
      'skippedCount INTEGER NOT NULL, factorRole TEXT NOT NULL, ' +
      'wouldFireV1Rule INTEGER NOT NULL, wouldFireBriefRule INTEGER NOT NULL, ' +
      'wouldFireV3Rule INTEGER NOT NULL)'
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
    /* additive: the calendar day a rating was saved, for the seven-day
       availability rule. Existing rows keep NULL and fall back to their
       week Monday. ALTER fails harmlessly once the column exists. */
    try { db.execSync('ALTER TABLE func ADD COLUMN savedOn TEXT'); } catch {}
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

interface Row {
  date: string; pain: number; cap: number | null; note: string;
  factors: string | null; logs: string | null; ctx: string | null;
}

function rowToEntry(r: Row): Entry {
  const e: Entry = { pain: r.pain, cap: r.cap, note: r.note };
  if (r.factors != null) { try { e.factors = JSON.parse(r.factors); } catch {} }
  if (r.logs != null) { try { e.logs = JSON.parse(r.logs); } catch {} }
  if (r.ctx != null) { try { e.ctx = cleanCtx(JSON.parse(r.ctx)); } catch {} }
  return e;
}

function put(date: string, e: Entry): void {
  conn().runSync(
    'INSERT OR REPLACE INTO days (date, pain, cap, note, factors, logs, ctx) VALUES (?, ?, ?, ?, ?, ?, ?)',
    date, e.pain, e.cap, e.note,
    e.factors ? JSON.stringify(e.factors) : null,
    e.logs ? JSON.stringify(e.logs) : null,
    e.ctx && Object.keys(e.ctx.a).length ? JSON.stringify(e.ctx) : null
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

/** write one moment into a day; returns the updated entry.
 *  The UTC stamp and offset are taken here, at the write, so every screen
 *  agrees on what "now" means and none of them invents its own. */
export function writeMoment(
  date: string, h: number, pain: number,
  loc?: string[] | null, q?: string[] | null, meta?: MomentMeta
): Entry {
  const e = applyMoment(getDay(date), h, pain, loc, q, meta || nowMeta(SCALE_VERSION));
  put(date, e);
  return e;
}

/* ── day-scoped answers ─────────────────────────────────────
   Written one at a time so a sheet with five questions and two answers
   stores two answers — not five, three of which are guesses. */

function writeAnswer(date: string, metricId: string, a: Answer): Entry | null {
  const e = getDay(date);
  if (!e) return null;                       // pain comes first, always
  const ctx: ContextAnswers = e.ctx
    ? { v: e.ctx.v, a: { ...e.ctx.a } }
    : { v: CONTEXT_VERSION, a: {} };
  ctx.a[metricId] = a;
  const next: Entry = { ...e, ctx };
  put(date, next);
  return next;
}

/** record an answer to a day-scoped question */
export function setAnswer(
  date: string, metricId: string, value: string | number, h: number, pid: number | null
): Entry | null {
  const m = getMetric(metricId);
  if (!m) return null;
  const d = new Date();
  return writeAnswer(date, metricId, {
    value, h, ts: d.getTime(), tz: -d.getTimezoneOffset(),
    qv: m.wordingVersion, pid,
  });
}

/** record that the question was PUT and declined. Stored, because "I was
 *  asked and chose not to say" is information — and is not the same thing
 *  as never having been asked, which is what an absent key means. */
export function skipAnswer(
  date: string, metricId: string, h: number, pid: number | null
): Entry | null {
  const m = getMetric(metricId);
  if (!m) return null;
  const d = new Date();
  return writeAnswer(date, metricId, {
    value: '', h, ts: d.getTime(), tz: -d.getTimezoneOffset(),
    qv: m.wordingVersion, pid, skipped: 1,
  });
}

/** remove one answer entirely — an edit, not a skip. The day returns to
 *  never having been asked that question. */
export function clearAnswer(date: string, metricId: string): Entry | null {
  const e = getDay(date);
  if (!e || !e.ctx) return e;
  const a = { ...e.ctx.a };
  delete a[metricId];
  const next: Entry = { ...e };
  if (Object.keys(a).length) next.ctx = { v: e.ctx.v, a };
  else delete next.ctx;
  put(date, next);
  return next;
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
  intervention: string | null; resp: string | null;
}

function rowToEvent(r: EventRow): PainEvent {
  const ev: PainEvent = { id: r.id, date: r.date, h: r.h, kind: r.kind as EventKind, text: r.text };
  if (r.quality != null) { try { ev.quality = JSON.parse(r.quality); } catch {} }
  if (r.helped != null) ev.helped = r.helped;
  if (r.intervention != null) ev.intervention = r.intervention;
  if (r.resp != null) ev.resp = r.resp as Response;
  if (r.linked != null) ev.linked = r.linked;
  return ev;
}

export function addEvent(ev: Omit<PainEvent, 'id'>): void {
  conn().runSync(
    'INSERT INTO events (date, h, kind, text, quality, helped, linked, intervention, resp) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ev.date, ev.h, ev.kind, ev.text,
    ev.quality && ev.quality.length ? JSON.stringify(ev.quality) : null,
    ev.helped != null ? ev.helped : null,
    ev.linked != null ? ev.linked : null,
    ev.intervention || null,
    ev.resp || null
  );
}

/** edit an existing event in place — same row, new content */
export function updateEvent(id: number, ev: Omit<PainEvent, 'id'>): void {
  conn().runSync(
    'UPDATE events SET date = ?, h = ?, kind = ?, text = ?, quality = ?, helped = ?, ' +
    'linked = ?, intervention = ?, resp = ? WHERE id = ?',
    ev.date, ev.h, ev.kind, ev.text,
    ev.quality && ev.quality.length ? JSON.stringify(ev.quality) : null,
    ev.helped != null ? ev.helped : null,
    ev.linked != null ? ev.linked : null,
    ev.intervention || null,
    ev.resp || null,
    id
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

interface FuncRow { week: string; ability: number; note: string; savedOn: string | null }

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
        // through put(), so a rewrite here can never drop a column this
        // function has not heard of — INSERT OR REPLACE deletes the row
        Object.keys(entries).forEach((k) => { put(k, entries[k]); });
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
    'INSERT OR REPLACE INTO func (week, ability, note, savedOn) VALUES (?, ?, ?, ?)',
    f.week, f.ability, f.note || '', f.savedOn || null
  );
}

export function getFunc(): FuncEntry[] {
  return conn().getAllSync<FuncRow>('SELECT * FROM func ORDER BY week')
    .map((r) => {
      const f: FuncEntry = { week: r.week, ability: r.ability, note: r.note };
      if (r.savedOn) f.savedOn = r.savedOn;
      return f;
    });
}

/* ── hypotheses and protocols ───────────────────────────────── */

export function addHypothesis(h: Omit<Hypothesis, 'id'>): number {
  const c = conn();
  c.runSync(
    'INSERT INTO hypotheses (createdOn, understand, harder, helps) VALUES (?, ?, ?, ?)',
    h.createdOn, h.understand, h.harder, h.helps
  );
  const r = c.getFirstSync<{ id: number }>('SELECT last_insert_rowid() AS id');
  return r ? r.id : 0;
}

export function updateHypothesis(id: number, h: Omit<Hypothesis, 'id'>): void {
  conn().runSync(
    'UPDATE hypotheses SET createdOn = ?, understand = ?, harder = ?, helps = ? WHERE id = ?',
    h.createdOn, h.understand, h.harder, h.helps, id
  );
}

export function getHypotheses(): Hypothesis[] {
  return conn().getAllSync<Hypothesis>('SELECT * FROM hypotheses ORDER BY id');
}

export function latestHypothesis(): Hypothesis | null {
  return conn().getFirstSync<Hypothesis>('SELECT * FROM hypotheses ORDER BY id DESC LIMIT 1') || null;
}

export function getProtocols(): Protocol[] {
  return conn().getAllSync<Protocol>('SELECT * FROM protocols ORDER BY startDate, id');
}

export function activeProtocol(): Protocol | null {
  return conn().getFirstSync<Protocol>(
    "SELECT * FROM protocols WHERE status = 'active' ORDER BY id DESC LIMIT 1"
  ) || null;
}

/** Open a period. Exactly one is active at a time, so any period still
 *  open is closed first — a factor set that was replaced is completed,
 *  not deleted, and its answers keep pointing at it. */
export function startProtocol(p: Omit<Protocol, 'id'>): number {
  const c = conn();
  let id = 0;
  c.withTransactionSync(() => {
    c.runSync(
      "UPDATE protocols SET status = 'completed', endDate = ? WHERE status = 'active'",
      p.startDate
    );
    c.runSync(
      'INSERT INTO protocols (version, startDate, endDate, reviewOn, chosenFactor, ' +
      'secondFactor, hypothesisId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      p.version, p.startDate, p.endDate, p.reviewOn,
      p.chosenFactor, p.secondFactor, p.hypothesisId, p.status
    );
    const r = c.getFirstSync<{ id: number }>('SELECT last_insert_rowid() AS id');
    id = r ? r.id : 0;
  });
  return id;
}

/** Push the review point out by another period. Keep observing does NOT
 *  restart the run — restarting would orphan every answer already given
 *  from the period it belongs to, and the whole point of pooling by
 *  (metric, wording) is that a slow question can keep accumulating. */
export function extendProtocol(id: number, fromIso: string): void {
  conn().runSync(
    'UPDATE protocols SET reviewOn = ? WHERE id = ?',
    addDays(fromIso, PROTOCOL_REVIEW_DAYS - 1), id
  );
}

export function endProtocol(id: number, endDate: string, status: ProtocolStatus = 'completed'): void {
  conn().runSync('UPDATE protocols SET status = ?, endDate = ? WHERE id = ?', status, endDate, id);
}

/** the rotation counter that keeps consecutive periods from landing on
 *  the same second factor */
export function getRotation(): number {
  return getPref<number>('protocol.rotation', 0);
}
export function setRotation(n: number): void {
  setPref('protocol.rotation', n);
}

/** what tends to make it better or worse — asked once, revisable */
export function getModifiers(): string[] {
  return cleanModifiers(getPref<string[]>('pain.modifiers', []));
}
export function setModifiers(ids: string[]): void {
  setPref('pain.modifiers', cleanModifiers(ids));
}

/* ── shadow mode ─────────────────────────────────────────────
   Written on evaluation, read by nobody but the user's own diagnostics
   export. Nothing here is rendered, and nothing here is counted in
   product analytics beyond a bare row count. */

export interface ShadowEval {
  id?: number;
  computedOn: string;
  protocolId: number | null;
  factorId: string;
  wordingVersion: number;
  relation: 'sameDay' | 'nextDay';
  levelA: string; levelB: string;
  nA: number; nB: number;
  meanA: number; meanB: number; delta: number;
  deltaFirstHalf: number | null; deltaSecondHalf: number | null;
  directionStable: number | null;
  daysObserved: number; daysMissing: number; skippedCount: number;
  factorRole: 'chosen' | 'second';
  wouldFireV1Rule: number;
  wouldFireBriefRule: number;
  wouldFireV3Rule: number;
}

export function addShadowEval(s: Omit<ShadowEval, 'id'>): void {
  conn().runSync(
    'INSERT INTO shadow_eval (computedOn, protocolId, factorId, wordingVersion, relation, ' +
    'levelA, levelB, nA, nB, meanA, meanB, delta, deltaFirstHalf, deltaSecondHalf, ' +
    'directionStable, daysObserved, daysMissing, skippedCount, factorRole, ' +
    'wouldFireV1Rule, wouldFireBriefRule, wouldFireV3Rule) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    s.computedOn, s.protocolId, s.factorId, s.wordingVersion, s.relation,
    s.levelA, s.levelB, s.nA, s.nB, s.meanA, s.meanB, s.delta,
    s.deltaFirstHalf, s.deltaSecondHalf, s.directionStable,
    s.daysObserved, s.daysMissing, s.skippedCount, s.factorRole,
    s.wouldFireV1Rule, s.wouldFireBriefRule, s.wouldFireV3Rule
  );
}

export function getShadowEvals(): ShadowEval[] {
  return conn().getAllSync<ShadowEval>('SELECT * FROM shadow_eval ORDER BY id');
}

export function countShadowEvals(): number {
  const r = conn().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM shadow_eval');
  return r ? r.n : 0;
}

export function clearShadowEvals(): void {
  conn().runSync('DELETE FROM shadow_eval');
}

/** off by default. Shadow rows are derived from health answers, so they
 *  travel only when the person carrying them says so. */
export function getDiagnosticsInExport(): boolean {
  return getPref<boolean>('export.diagnostics', false);
}
export function setDiagnosticsInExport(on: boolean): void {
  setPref('export.diagnostics', on);
}

/* ── the function goal ──────────────────────────────────────── */

export function getGoal(): string | null {
  return getPref<string | null>('goal.text', null);
}
export function setGoal(text: string): void {
  setPref('goal.text', text.trim() || null);
}

/* ── backup ─────────────────────────────────────────────────── */

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  ok: true;
  mode: RestoreMode;
  days: number;
  events: number;
  func: number;
  hypotheses: number;
  protocols: number;
}

/** Validate a backup file WITHOUT writing anything — the caller shows the
 *  restore choices only for a file that passed. */
export function inspectBackup(json: string): ValidBackup | null {
  return validateBackup(json);
}

/** Apply an already-validated backup.
 *
 *  'replace' — current check-ins, events, ratings and the activity are
 *  removed inside one transaction and the backup's contents take their
 *  place. Reminder settings and the scale-version stamp are kept: they
 *  are device settings, not records.
 *
 *  'merge' — a backup day replaces that same day and every other day is
 *  left alone; events are added only when no identical event exists
 *  (stable content identity — see model.eventKey); a backup week's rating
 *  replaces that same week. Nothing is ever silently deleted.
 */
export function applyBackup(backup: ValidBackup, mode: RestoreMode): RestoreResult {
  const c = conn();
  const dayKeys = Object.keys(backup.entries);
  let eventsAdded = 0;
  let hypAdded = 0;
  let protAdded = 0;
  c.withTransactionSync(() => {
    if (mode === 'replace') {
      c.runSync('DELETE FROM days');
      c.runSync('DELETE FROM events');
      c.runSync('DELETE FROM weekly');
      c.runSync('DELETE FROM func');
      c.runSync('DELETE FROM hypotheses');
      c.runSync('DELETE FROM protocols');
      c.runSync('DELETE FROM prefs WHERE k = ?', 'goal.text');
      c.runSync('DELETE FROM prefs WHERE k = ?', 'pain.modifiers');
    }
    dayKeys.forEach((k) => put(k, backup.entries[k]));
    const existing = mode === 'replace' ? [] : getEvents();
    const fresh = dedupeEvents(existing, backup.events);
    fresh.forEach((ev) => addEvent(ev));
    eventsAdded = fresh.length;
    backup.func.forEach((f) => putFunc(f));
    if (backup.goal) setGoal(backup.goal);
    if (backup.modifiers.length) setModifiers(backup.modifiers);

    /* Hypotheses and protocols merge on content, like events: local row
       ids are not stable across devices, so identity is what the record
       says, not where it happened to sit. Shadow rows are never restored
       from a backup — they are derived, and derived data is recomputed
       rather than carried, so a restore can never import a conclusion. */
    const seenHyp: Record<string, true> = {};
    if (mode !== 'replace') {
      getHypotheses().forEach((h) => {
        seenHyp[[h.createdOn, h.understand, h.harder, h.helps].join('|')] = true;
      });
    }
    backup.hypotheses.forEach((h) => {
      const k = [h.createdOn, h.understand, h.harder, h.helps].join('|');
      if (seenHyp[k]) return;
      seenHyp[k] = true;
      addHypothesis(h);
      hypAdded++;
    });

    const seenProt: Record<string, true> = {};
    if (mode !== 'replace') getProtocols().forEach((p) => { seenProt[protocolKey(p)] = true; });
    backup.protocols.forEach((p) => {
      const k = protocolKey(p);
      if (seenProt[k]) return;
      seenProt[k] = true;
      c.runSync(
        'INSERT INTO protocols (version, startDate, endDate, reviewOn, chosenFactor, ' +
        'secondFactor, hypothesisId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        p.version, p.startDate, p.endDate, p.reviewOn,
        p.chosenFactor, p.secondFactor, p.hypothesisId, p.status
      );
      protAdded++;
    });
    /* A merge could leave two periods open — two devices, two starts.
       The most recent wins and the rest are closed, because "one active
       at a time" is an invariant, not a preference. */
    const open = c.getAllSync<Protocol>("SELECT * FROM protocols WHERE status = 'active' ORDER BY id");
    if (open.length > 1) {
      open.slice(0, -1).forEach((p) => {
        c.runSync(
          "UPDATE protocols SET status = 'completed', endDate = COALESCE(endDate, reviewOn) WHERE id = ?",
          p.id as number
        );
      });
    }
  });
  return {
    ok: true, mode, days: dayKeys.length, events: eventsAdded,
    func: backup.func.length, hypotheses: hypAdded, protocols: protAdded,
  };
}

/** Export everything, versioned. v4 carries entries, events (with their
 *  row ids), function check-ins with their saved dates, and the activity;
 *  it records the pain-scale version so a future reader knows which label
 *  set the numbers were captured under. */
export function exportBackup(todayIso: string): string {
  const out: Record<string, unknown> = {
    app: 'pattern', version: BACKUP_VERSION, scaleVersion: SCALE_VERSION,
    contextVersion: CONTEXT_VERSION, exported: todayIso,
    entries: getAll(), events: getEvents(), func: getFunc(), goal: getGoal(),
    hypotheses: getHypotheses(), protocols: getProtocols(), modifiers: getModifiers(),
  };
  /* Shadow rows are health-derived and leave only when asked for. Off by
     default, and a restore never reads them back — see applyBackup. */
  if (getDiagnosticsInExport()) out.diagnostics = { shadowEval: getShadowEvals() };
  return JSON.stringify(out, null, 2);
}

export function deleteAll(): void {
  const c = conn();
  c.withTransactionSync(() => {
    c.runSync('DELETE FROM days');
    c.runSync('DELETE FROM events');
    c.runSync('DELETE FROM weekly');
    c.runSync('DELETE FROM func');
    c.runSync('DELETE FROM hypotheses');
    c.runSync('DELETE FROM protocols');
    c.runSync('DELETE FROM shadow_eval');
    c.runSync('DELETE FROM prefs');
  });
}

/** dev helper: normalize a single raw entry through the model (used by seeds) */
export function putClean(date: string, raw: unknown): void {
  const e = cleanEntry(raw);
  if (e) put(date, e);
}
