/**
 * Medicines the person takes, the times they take them, and whether
 * each dose was taken — kept by Pattern itself (1 Oct 2026).
 *
 * WHY PATTERN KEEPS ITS OWN LIST. Until now a dose existed here only if
 * Apple Health's Medications held it: most testers do not use that
 * screen, so the one comparison built for medicine (doses.ts, pain
 * before and after) sat empty, and the reminder people actually wanted
 * — "did I take it?" — was somebody else's app. The list lives on the
 * phone with the rest of the record, travels in the backup, and each
 * logged dose becomes a NormalizedDose that doses.ts reads exactly as
 * it reads Health's. Nothing new is inferred: the comparison, its
 * gates and its words are the ones already argued.
 *
 * THREE STATES, NEVER TWO. A scheduled time with no log is "not said",
 * never "skipped"; a skip is only ever a tap on Skipped. A skipped dose
 * is shown on its day and never compared (doses.ts says why).
 *
 * WHAT IT NEVER DOES. Suggest a dose, a time, a change, or that one was
 * missed. The name and the amount are the person's own words, shown
 * back as typed, and nothing reads the amount as a number.
 *
 * Pure: no storage, no React Native — db.ts keeps the list and the log,
 * medReminders.ts schedules the notifications, and the screens render.
 */
import { HealthDay, NormalizedDose } from './health/types';
import { MED_DEDUPE_MIN, MED_DUE_WINDOW_MIN } from './thresholds';

export interface Medication {
  /** epoch ms at creation — an id that survives a backup and a merge */
  id: number;
  /** as the person typed it */
  name: string;
  /** "200 mg", "one tablet" — free text, never parsed; '' when unsaid */
  dose: string;
  /** minutes after midnight, sorted, deduped; [] = taken as needed */
  times: number[];
  /** a notification at each time */
  remind: boolean;
}

export interface DoseLog {
  medId: number;
  /** local date the dose belongs to */
  date: string;
  /** the scheduled minute it answers; -1 for an as-needed dose */
  slot: number;
  /** when it was marked — the time doses.ts pairs pain around */
  h: number;
  status: 'taken' | 'skipped';
}

/** a name is a word or two, not a note */
export const MED_NAME_MAX = 40;
/** the amount, as a label — "200 mg", "half a tablet" */
export const MED_DOSE_MAX = 24;
/** four a day covers every schedule testers described; more is a
 *  regimen this list is the wrong tool for */
export const MED_TIMES_MAX = 4;
/** eight medicines × four times is thirty-two daily notifications at
 *  most — beside the check-in queue's thirty-five, inside iOS's
 *  sixty-four only because medicine reminders repeat daily rather than
 *  being queued a week ahead (medReminders.ts) */
export const MEDS_MAX = 8;
const isIsoDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMinute = (v: unknown): v is number =>
  typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1439;

export function cleanTimes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen: Record<number, true> = {};
  const out: number[] = [];
  raw.forEach((v) => {
    if (!isMinute(v)) return;
    const m = Math.round(v);
    if (seen[m]) return;
    seen[m] = true;
    out.push(m);
  });
  return out.sort((a, b) => a - b).slice(0, MED_TIMES_MAX);
}

/** a raw medicine from a backup or a form → a clean one, or null */
export function cleanMedication(raw: unknown): Medication | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Medication>;
  if (typeof r.id !== 'number' || !isFinite(r.id)) return null;
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  return {
    id: r.id,
    name: r.name.trim().slice(0, MED_NAME_MAX),
    dose: typeof r.dose === 'string' ? r.dose.trim().slice(0, MED_DOSE_MAX) : '',
    times: cleanTimes(r.times),
    remind: r.remind === true,
  };
}

export function cleanMedications(raw: unknown): Medication[] {
  if (!Array.isArray(raw)) return [];
  const seen: Record<number, true> = {};
  const out: Medication[] = [];
  raw.forEach((r) => {
    const m = cleanMedication(r);
    if (!m || seen[m.id]) return;
    seen[m.id] = true;
    out.push(m);
  });
  return out.slice(0, MEDS_MAX);
}

export function cleanDoseLog(raw: unknown): DoseLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<DoseLog>;
  if (typeof r.medId !== 'number' || !isFinite(r.medId)) return null;
  if (!isIsoDate(r.date)) return null;
  if (r.slot !== -1 && !isMinute(r.slot)) return null;
  if (!isMinute(r.h)) return null;
  if (r.status !== 'taken' && r.status !== 'skipped') return null;
  return { medId: r.medId, date: r.date, slot: Math.round(r.slot as number), h: Math.round(r.h), status: r.status };
}

/** a scheduled log's identity: one answer per medicine, day and time.
 *  As-needed doses are each their own. */
function slotKey(l: DoseLog): string | null {
  return l.slot < 0 ? null : l.medId + '|' + l.date + '|' + l.slot;
}

export function cleanDoseLogs(raw: unknown): DoseLog[] {
  if (!Array.isArray(raw)) return [];
  const out: DoseLog[] = [];
  raw.forEach((r) => { const l = cleanDoseLog(r); if (l) out.push(l); });
  return withLog([], out);
}

/** the log with `add` written in: a scheduled time answered twice keeps
 *  the later answer — "skipped", then "actually, taken" is a correction */
export function withLog(logs: DoseLog[], add: DoseLog | DoseLog[]): DoseLog[] {
  const adds = Array.isArray(add) ? add : [add];
  let out = logs.slice();
  adds.forEach((a) => {
    const k = slotKey(a);
    if (k) out = out.filter((l) => slotKey(l) !== k);
    out.push(a);
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.h - b.h));
}

/** remove one scheduled answer — an undo returns the time to "not said" */
export function withoutLog(logs: DoseLog[], medId: number, date: string, slot: number): DoseLog[] {
  return logs.filter((l) => !(l.medId === medId && l.date === date && l.slot === slot));
}

/** merge a backup's logs into this phone's: what this phone already
 *  answered for a scheduled time stands, everything new is added */
export function mergeDoseLogs(have: DoseLog[], incoming: DoseLog[]): DoseLog[] {
  const keys: Record<string, true> = {};
  const exact: Record<string, true> = {};
  have.forEach((l) => {
    const k = slotKey(l); if (k) keys[k] = true;
    exact[[l.medId, l.date, l.slot, l.h, l.status].join('|')] = true;
  });
  const add = incoming.filter((l) => {
    const k = slotKey(l);
    if (k) return !keys[k];
    return !exact[[l.medId, l.date, l.slot, l.h, l.status].join('|')];
  });
  return withLog(have, add);
}

export interface DueDose {
  med: Medication;
  slot: number;
}

/**
 * The scheduled times today that have come and not been answered, and
 * have not been waiting longer than MED_DUE_WINDOW_MIN. Earliest first.
 * Nothing about yesterday: a dose unanswered yesterday stays "not said",
 * and Today never asks about it — no backlog, no count of misses.
 */
export function dueDoses(
  meds: Medication[], logs: DoseLog[], todayIso: string, nowMin: number
): DueDose[] {
  const answered: Record<string, true> = {};
  logs.forEach((l) => { const k = slotKey(l); if (k) answered[k] = true; });
  const out: DueDose[] = [];
  meds.forEach((med) => {
    med.times.forEach((slot) => {
      if (slot > nowMin || nowMin - slot > MED_DUE_WINDOW_MIN) return;
      if (answered[med.id + '|' + todayIso + '|' + slot]) return;
      out.push({ med, slot });
    });
  });
  return out.sort((a, b) => a.slot - b.slot);
}

/** the id doses.ts groups a medicine under — prefixed so it can never
 *  collide with a HealthKit concept id */
export function appMedId(id: number): string {
  return 'pattern:' + id;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The stored Health days with Pattern's own logged doses folded in, for
 * the dose comparison ONLY — never written back, never handed to
 * anything that reads coverage. A date with no Health day gets a bare
 * one whose coverage is empty, so no other comparison can mistake it
 * for Health data. A logged dose that Health already holds (same name,
 * same day, within MED_DEDUPE_MIN) is left out.
 */
export function withAppDoses(
  health: Record<string, HealthDay>, meds: Medication[], logs: DoseLog[]
): Record<string, HealthDay> {
  if (!logs.length) return health;
  const byId: Record<number, Medication> = {};
  meds.forEach((m) => { byId[m.id] = m; });
  const out: Record<string, HealthDay> = { ...health };
  logs.forEach((l) => {
    const med = byId[l.medId];
    if (!med) return;               // a deleted medicine's history is not compared
    const day = out[l.date];
    const existing = (day && day.doses) || [];
    const dup = existing.some((d) => d.medId.indexOf('pattern:') !== 0
      && norm(d.med) === norm(med.name) && Math.abs(d.h - l.h) <= MED_DEDUPE_MIN);
    if (dup) return;
    const dose: NormalizedDose = { h: l.h, medId: appMedId(med.id), med: med.name, status: l.status };
    out[l.date] = day
      ? { ...day, doses: existing.concat(dose) }
      : { date: l.date, coverage: {}, doses: [dose] };
  });
  return out;
}
