/**
 * Draining the watch's mailbox into the record.
 *
 * The watch sends {v, pain, ts, tz}; the native WatchBridge queues the
 * deliveries; this file is the ONE place they become check-ins — through
 * the same validation and the same writeMoment as a check-in made on the
 * phone. The watch is an input device, never a second writer.
 *
 * THE GUARD IS LOAD-BEARING, same as the glass and HealthKit: the
 * require throws on every binary that predates the watch build, and
 * those binaries share this runtime over the air. Caught, they simply
 * have no watch — which is also true.
 *
 * Each item lands at the minute it was MADE, from its own ts and tz,
 * not at the minute it synced: a check-in from a morning run that
 * reaches the phone at lunch belongs to the morning. Junk — a missing
 * version, a pain that is not 0–10, a timestamp from a dead-battery
 * clock — is dropped, never coerced; dropping a malformed message from
 * our own watch app is honest, inventing a value for it is not.
 */
import * as db from './db';
import { momentFromEpoch, nowMeta } from './model';
import { SCALE_VERSION } from './painScale';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bridge = (() => {
  try { return require('../modules/watch-bridge').default; } catch { return null; }
})();

export function watchAvailable(): boolean {
  return bridge != null;
}

/** pull everything the watch has sent and write it. Returns how many
 *  check-ins were added, so the caller knows whether to refresh. */
export function drainWatchCheckins(): number {
  if (!bridge) return 0;
  let items: Record<string, unknown>[] = [];
  try { items = bridge.drain() || []; } catch { return 0; }
  let wrote = 0;
  items.forEach((it) => {
    if (!it || it.v !== 1) return;
    const pain = it.pain;
    if (typeof pain !== 'number' || !isFinite(pain)) return;
    const p = Math.round(pain);
    if (p < 0 || p > 10) return;
    const at = momentFromEpoch(it.ts, it.tz);
    if (!at) return;
    /* pain-only, exactly like the phone's "That's it for now" — and the
       capture stamps are the watch's own, so the record reads the same
       as if the phone had written it at that minute */
    db.writeMoment(at.date, at.h, p, null, null, {
      ...nowMeta(SCALE_VERSION),
      ts: Math.round(it.ts as number),
      tz: Math.round(it.tz as number),
    });
    wrote++;
  });
  return wrote;
}
