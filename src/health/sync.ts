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
/* the backfill marker is NOT a pref: it lives in the health file beside
   the days, so that an empty file — a new phone, a purged cache — is
   always read as "never filled". See db.getHealthSyncedFrom. */

export function healthCategories(): HealthCategory[] {
  return db.getPref<HealthCategory[]>(PREF_CATEGORIES, []);
}
export function healthRequestedOn(): string | null {
  return db.getPref<string | null>(PREF_REQUESTED, null);
}
/** the sheet has been completed for these categories — the most the
 *  app is allowed to remember about authorization */
export function markHealthRequested(categories: HealthCategory[]): void {
  /* A category the record has not seen before starts its history from
     scratch, so the watermark goes: the next pass reaches back the full
     backfill span instead of the ten-day late-arrival window. Without
     this, "Update what Pattern reads" gave a newly added kind ten days
     of history and left it under the paired-days gate for weeks;
     re-fetching the kinds already stored is the price, and putHealthDay
     simply overwrites them with the same facts. */
  const before = healthCategories();
  if (before.some((c) => categories.indexOf(c) < 0)) db.clearHealthDays();
  if (categories.some((c) => before.indexOf(c) < 0)) db.clearHealthSyncedFrom();
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
  const revision = db.getHealthRevision();
  const current = () => revision === db.getHealthRevision()
    && !!healthRequestedOn() && JSON.stringify(cats) === JSON.stringify(healthCategories());
  try {
    const today = todayISO();
    /* first pass reaches back the working span; later passes only the
       late-arrival window */
    const already = db.getHealthSyncedFrom();
    const from = already
      ? addDays(today, -(HEALTH_RESYNC_DAYS - 1))
      : addDays(today, -(HEALTH_BACKFILL_DAYS - 1));
    let complete = true;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      try {
        const raw = await service.fetchDay(d, cats);
        /* Disconnect, delete-all, or a changed selection invalidates
           the pass, including its watermark, across every native await. */
        if (!current()) return;
        if (raw.incomplete) { complete = false; continue; }
        const day = normalizeDay(raw, clock);
        /* Successful silence removes stale samples without writing a
           measured-zero day. A failed query preserves the old cache. */
        if (Object.keys(day.coverage).length) db.putHealthDay(d, day);
        else db.removeHealthDay(d);
      } catch { complete = false; /* retry missing backfill days next time */ }
    }
    if (!already && complete && current()) db.setHealthSyncedFrom(from);
  } finally {
    syncing = false;
  }
}

/** everything stored, for the engine and the coverage API */
export function storedHealthDays(): Record<string, HealthDay> {
  return db.getHealthDays<HealthDay>();
}
