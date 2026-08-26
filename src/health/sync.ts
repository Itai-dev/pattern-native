/**
 * Foreground sync — the whole of Pattern's Health refresh strategy,
 * and the reasons it is only this.
 *
 * FOREGROUND, NOT BACKGROUND, DELIBERATELY. Background delivery and
 * anchored queries exist in the library, but they wake native code on
 * a schedule this codebase cannot test from where it is built, and
 * their failure mode is silent staleness that looks identical to
 * working. A foreground pass on every open and every return from
 * background is simple, visible, and enough: health context is read
 * when the user is looking at screens that use it, and a chart that
 * is minutes stale on a phone that just woke is not a defect in a
 * record measured in days. Revisit if a real tester's watch data
 * proves too late too often — the decision is one function.
 *
 * RECENT DAYS ARE RE-DERIVED, NOT TRUSTED. A watch syncs when it
 * syncs; last night's sleep may land at lunchtime. The last
 * HEALTH_RESYNC_DAYS days are recomputed on every pass, and anything
 * older is stable. The first pass after connecting reaches back
 * HEALTH_BACKFILL_DAYS and never further — the record's working span,
 * not a full-history crawl.
 *
 * Failures are per-day and swallowed: a sync that dies on Tuesday
 * still writes Monday, and nothing here may ever block or slow a
 * check-in.
 */
import * as db from '../db';
import { addDays, todayISO } from '../model';
import { HEALTH_BACKFILL_DAYS, HEALTH_RESYNC_DAYS } from '../thresholds';
import { normalizeDay } from './normalize';
import { HealthCategory, HealthDay, HealthService, LocalClock } from './types';

/* setup state, as preferences — small, non-health values */
const PREF_CATEGORIES = 'health.categories';
const PREF_REQUESTED = 'health.requestedOn';
const PREF_SYNCED_FROM = 'health.syncedFrom';

export function healthCategories(): HealthCategory[] {
  return db.getPref<HealthCategory[]>(PREF_CATEGORIES, []);
}
export function healthRequestedOn(): string | null {
  return db.getPref<string | null>(PREF_REQUESTED, null);
}
/** the sheet has been completed for these categories — the most the
 *  app is allowed to remember about authorization */
export function markHealthRequested(categories: HealthCategory[]): void {
  db.setPref(PREF_CATEGORIES, categories);
  db.setPref(PREF_REQUESTED, todayISO());
}
export function disconnectHealth(): void {
  db.setPref(PREF_CATEGORIES, []);
  db.setPref(PREF_REQUESTED, null);
  db.clearHealthDays();
}

let syncing = false;

/**
 * One pass: fetch, normalize, store. Serialised — a second call while
 * one runs returns immediately rather than racing it.
 */
export async function syncHealth(service: HealthService, clock: LocalClock): Promise<void> {
  if (syncing) return;
  const cats = healthCategories();
  if (!service.available() || !healthRequestedOn() || !cats.length) return;
  syncing = true;
  try {
    const today = todayISO();
    /* first pass reaches back the working span; later passes only the
       late-arrival window */
    const already = db.getPref<string | null>(PREF_SYNCED_FROM, null);
    const from = already
      ? addDays(today, -(HEALTH_RESYNC_DAYS - 1))
      : addDays(today, -(HEALTH_BACKFILL_DAYS - 1));
    for (let d = from; d <= today; d = addDays(d, 1)) {
      try {
        const raw = await service.fetchDay(d, cats);
        const day = normalizeDay(raw, clock);
        /* a day that produced nothing writes nothing — an empty row
           would read as "measured, and there was nothing", which is
           precisely the claim an absent day must not make */
        if (Object.keys(day.coverage).length) db.putHealthDay(d, day);
      } catch { /* this day stays as it was; the next still runs */ }
    }
    if (!already) db.setPref(PREF_SYNCED_FROM, from);
  } finally {
    syncing = false;
  }
}

/** everything stored, for the engine and the coverage API */
export function storedHealthDays(): Record<string, HealthDay> {
  return db.getHealthDays<HealthDay>();
}
