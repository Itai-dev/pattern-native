/**
 * The one file that knows HealthKit exists.
 *
 * GUARDED THE WAY THE GLASS IS. This ships over the air to binaries
 * that do not carry the native module — builds installed before the
 * HealthKit build reached TestFlight — and requiring a nitro module on
 * those phones throws at load. So the library is required lazily,
 * inside try/catch, exactly the pattern TabBar.tsx already proved with
 * expo-glass-effect: caught, the app gets UnavailableHealthService and
 * the Profile row simply says the feature needs the newest build. The
 * runtime version does NOT change for this — an additive native module
 * behind a JS guard is the same situation builds 15 and 18 already
 * live in, and bumping the runtime is the one change AGENTS.md forbids
 * without a migration plan.
 *
 * READ-ONLY BY CONSTRUCTION. `toShare` is never populated; there is no
 * write path to misuse, and the entitlement copy promises none.
 *
 * WHAT THIS FILE DOES NOT KNOW: what was granted. HealthKit hides read
 * denials by design — a denied type just returns no samples — so this
 * adapter never reports permission state, only samples. The setup
 * screen's states are built on what CAN be known (asked / not asked;
 * data seen / not seen) and nothing here undermines that.
 *
 * Query mapping, verified against @kingstinct/react-native-healthkit
 * v14 type declarations:
 *   requestAuthorization({ toRead })            → Promise<boolean>
 *   queryQuantitySamples(id, { filter, limit }) → samples w/ Date pairs
 *   queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', …)
 *   queryWorkoutSamples({ filter, limit })      → proxies with uuid
 *   queryStateOfMindSamples({ filter, limit })  → iOS 18+; guarded
 * Values are read tolerantly (quantity ?? value, Date ?? ISO string):
 * one device pass on TestFlight is still required, and this file says
 * so rather than pretending a Windows build box can prove an iPhone.
 */
import { Platform } from 'react-native';
import { addDays, iso } from '../model';
import {
  DayRawBundle, HealthCategory, HealthService, LocalClock, QuantitySample,
  SleepSample, SleepStage, StateOfMindSample, WorkoutSample,
} from './types';
import { emptyBundle } from './mock';

/* ── the guarded require ───────────────────────────────────── */

type HK = {
  isHealthDataAvailable: () => boolean;
  requestAuthorization: (t: { toRead: string[] }) => Promise<boolean>;
  queryQuantitySamples: (id: string, opts: unknown) => Promise<unknown[]>;
  queryCategorySamples: (id: string, opts: unknown) => Promise<unknown[]>;
  queryWorkoutSamples: (opts: unknown) => Promise<unknown[]>;
  queryStateOfMindSamples?: (opts: unknown) => Promise<unknown[]>;
};

const LIB: HK | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('@kingstinct/react-native-healthkit');
    return (m && typeof m.isHealthDataAvailable === 'function') ? (m as HK) : null;
  } catch {
    return null; // a binary without the module — the feature waits for TestFlight
  }
})();

/* ── identifiers per category — exactly what the user picked, nothing
      speculative. Requesting a type is visible on Apple's sheet, so an
      unrequested type is a promise kept. ───────────────────── */

const TYPES: Record<HealthCategory, string[]> = {
  sleep: ['HKCategoryTypeIdentifierSleepAnalysis'],
  movement: [
    'HKQuantityTypeIdentifierStepCount',
    'HKQuantityTypeIdentifierDistanceWalkingRunning',
    'HKQuantityTypeIdentifierActiveEnergyBurned',
    /* upright time, Watch-only. Added after the first TestFlight build:
       an already-connected user reads nothing for it until they tap
       "Update what Pattern reads", which re-presents Apple's sheet with
       just the new row — and until then the type simply returns no
       samples, which the whole pipeline already treats as "absent". */
    'HKQuantityTypeIdentifierAppleStandTime',
  ],
  workouts: ['HKWorkoutTypeIdentifier'],
  heart: [
    'HKQuantityTypeIdentifierRestingHeartRate',
    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  ],
  mind: ['HKStateOfMindTypeIdentifier'],
};

/** does this OS/library actually offer State of Mind — iOS 18's type,
 *  absent from older stores and older library builds alike */
function mindSupported(): boolean {
  return !!LIB && typeof LIB.queryStateOfMindSamples === 'function';
}

/* ── tolerant readers — the store's Dates may arrive as Date objects
      or ISO strings depending on the bridge; both become epoch ms, and
      anything unreadable becomes "no sample" rather than a crash ── */

function ts(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') { const n = new Date(v).getTime(); return isNaN(n) ? null : n; }
  if (typeof v === 'number' && isFinite(v)) return v;
  return null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
function sourceOf(s: Record<string, unknown>): string {
  const rev = s.sourceRevision as { source?: { bundleIdentifier?: string } } | undefined;
  return (rev && rev.source && rev.source.bundleIdentifier) || 'unknown';
}

function quantity(s: unknown): QuantitySample | null {
  const r = s as Record<string, unknown>;
  const start = ts(r.startDate), end = ts(r.endDate);
  const value = num(r.quantity != null ? r.quantity : r.value);
  if (start == null || end == null || value == null) return null;
  return { start, end, value, source: sourceOf(r) };
}

/** HK sleep values: 0 inBed, 2 awake, 1/3/4/5 asleep in some stage.
 *  Stages collapse to 'asleep' — this app does not grade sleeping
 *  brains, it sums time asleep. */
function sleepStage(v: unknown): SleepStage {
  if (v === 0) return 'inBed';
  if (v === 2) return 'awake';
  return 'asleep';
}

/* ── the real clock — the device's own calendar, DST included,
      because Date's local arithmetic is the calendar the user lives
      in. Injected everywhere so tests can lie about it. ─────── */

export const deviceClock: LocalClock = {
  dateOf: (t) => iso(new Date(t)),
  minutesOf: (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); },
  startOf: (date) => {
    const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    return d.getTime();
  },
};

/* ── the service ───────────────────────────────────────────── */

export class HealthKitService implements HealthService {
  available(): boolean {
    try { return !!LIB && LIB.isHealthDataAvailable(); } catch { return false; }
  }

  async requestAuthorization(categories: HealthCategory[]): Promise<void> {
    if (!LIB) throw new Error('HealthKit is not available on this device');
    const toRead: string[] = [];
    categories.forEach((c) => {
      if (c === 'mind' && !mindSupported()) return; // older iOS: not offered, not requested
      TYPES[c].forEach((t) => toRead.push(t));
    });
    if (!toRead.length) return;
    await LIB.requestAuthorization({ toRead });
  }

  /** raw samples for one local date. Every query is independent and
   *  individually caught: one failing type must not empty the day. */
  async fetchDay(date: string, categories: HealthCategory[]): Promise<DayRawBundle> {
    const out = emptyBundle(date);
    if (!LIB) return out;
    const dayStart = new Date(deviceClock.startOf(date));
    const dayEnd = new Date(deviceClock.startOf(addDays(date, 1)));
    const opts = (from: Date, to: Date) => ({
      filter: { date: { startDate: from, endDate: to } },
      limit: 0,
      ascending: true,
    });
    const q = async (id: string, unit: string, from: Date, to: Date): Promise<QuantitySample[]> => {
      try {
        const rows = await LIB.queryQuantitySamples(id, { ...opts(from, to), unit });
        return rows.map(quantity).filter((s): s is QuantitySample => s != null);
      } catch { return []; }
    };

    if (categories.indexOf('sleep') >= 0) {
      try {
        /* a superset of the night window — normalize.ts clips to
           [previous 18:00, noon]; fetching wide costs one query */
        const from = new Date(deviceClock.startOf(addDays(date, -1)) + 12 * 3600000);
        const to = new Date(deviceClock.startOf(date) + 14 * 3600000);
        const rows = await LIB.queryCategorySamples(
          'HKCategoryTypeIdentifierSleepAnalysis', opts(from, to));
        out.sleep = rows.map((s) => {
          const r = s as Record<string, unknown>;
          const start = ts(r.startDate), end = ts(r.endDate);
          if (start == null || end == null) return null;
          return { start, end, stage: sleepStage(r.value), source: sourceOf(r) } as SleepSample;
        }).filter((s): s is SleepSample => s != null);
      } catch { /* sleep stays empty — absent, not zero */ }
    }

    if (categories.indexOf('movement') >= 0) {
      out.steps = await q('HKQuantityTypeIdentifierStepCount', 'count', dayStart, dayEnd);
      out.distance = await q('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', dayStart, dayEnd);
      out.activeEnergy = await q('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', dayStart, dayEnd);
      out.stand = await q('HKQuantityTypeIdentifierAppleStandTime', 'min', dayStart, dayEnd);
    }

    if (categories.indexOf('workouts') >= 0) {
      try {
        const rows = await LIB.queryWorkoutSamples(opts(dayStart, dayEnd));
        out.workouts = rows.map((w) => {
          const r = w as Record<string, unknown>;
          const start = ts(r.startDate), end = ts(r.endDate);
          const uuid = typeof r.uuid === 'string' ? r.uuid : null;
          if (start == null || end == null || !uuid) return null;
          const energyQ = r.totalEnergyBurned as { quantity?: number } | number | undefined;
          const energy = typeof energyQ === 'number' ? energyQ
            : energyQ && typeof energyQ.quantity === 'number' ? energyQ.quantity : undefined;
          return {
            uuid, start, end,
            activity: String(r.workoutActivityType != null ? r.workoutActivityType : 'workout'),
            energy, source: sourceOf(r),
          } as WorkoutSample;
        }).filter((w): w is WorkoutSample => w != null);
      } catch { /* workouts stay empty */ }
    }

    if (categories.indexOf('heart') >= 0) {
      out.restingHeartRate = await q('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', dayStart, dayEnd);
      out.hrvSDNN = await q('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', dayStart, dayEnd);
    }

    if (categories.indexOf('mind') >= 0 && mindSupported()) {
      try {
        const rows = await LIB.queryStateOfMindSamples!(opts(dayStart, dayEnd));
        out.stateOfMind = rows.map((s) => {
          const r = s as Record<string, unknown>;
          const t = ts(r.startDate != null ? r.startDate : r.date);
          const valence = num(r.valence);
          if (t == null || valence == null) return null;
          return { ts: t, valence, kind: String(r.kind || 'momentaryEmotion') } as StateOfMindSample;
        }).filter((s): s is StateOfMindSample => s != null);
      } catch { /* state of mind stays empty */ }
    }

    return out;
  }
}

/** what the app actually uses: the real store when the binary carries
 *  it, the honest nothing otherwise */
export function healthAvailableOnThisBinary(): boolean {
  return new HealthKitService().available();
}
