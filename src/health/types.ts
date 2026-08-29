/**
 * The health context vocabulary — every shape the Apple Health
 * integration speaks, defined once, with no HealthKit and no React
 * Native in it. Everything here compiles to plain JS and runs in Node,
 * which is what makes the windowing and engine testable without a
 * simulator.
 *
 * TWO LAYERS, DELIBERATELY SEPARATE. Raw samples (what a store returned,
 * provenance intact) and the normalized day (what analysis reads). The
 * adapter produces samples; normalize.ts turns them into days; nothing
 * downstream ever touches a sample again. That boundary is what lets a
 * future medication-dose event, or a different health store entirely,
 * join without rewriting the analysis: it only has to learn to be a
 * sample.
 *
 * MISSING IS MISSING. Every field of the normalized day is optional, and
 * absent means "not measured", never zero. A day without step data is
 * not a day of no steps — it is a day the phone was in a drawer, and
 * treating it as zero would manufacture the strongest possible value
 * out of the weakest possible evidence.
 */

/* ── categories, as the user chooses them ────────────────────
   The setup screen offers these five; each expands to concrete sample
   kinds below. The user picks categories; the adapter requests only the
   underlying types those categories name. */

export type HealthCategory =
  | 'sleep'
  | 'movement'   // steps, distance, active energy
  | 'workouts'
  | 'heart'      // resting HR, HRV (SDNN) — imported, never analysed in v1
  | 'mind';      // State of Mind — imported, never analysed in v1

export const HEALTH_CATEGORIES: { id: HealthCategory; name: string; blurb: string }[] = [
  {
    id: 'sleep', name: 'Sleep',
    blurb: 'How long you slept, from the Health app’s sleep record.',
  },
  {
    id: 'movement', name: 'Daily movement',
    blurb: 'Steps, walking distance, active energy — and time upright, from an Apple Watch, for how much of the day was spent sitting still.',
  },
  {
    id: 'workouts', name: 'Workouts',
    blurb: 'Workouts you or your watch recorded, with their time and length.',
  },
  {
    id: 'heart', name: 'Heart and recovery',
    blurb: 'Resting heart rate and heart-rate variability. Kept as context — Pattern draws no conclusions from them.',
  },
  {
    id: 'mind', name: 'State of Mind',
    blurb: 'Moments you logged in Health, where your iOS version supports it. Context only.',
  },
];

/* ── setup state ─────────────────────────────────────────────
   HealthKit deliberately hides read denials: an app cannot tell "denied"
   from "no data". So the only states Pattern is allowed to claim are
   the ones it can actually know. `dataSeen` is a fact about query
   results, never a statement about permission. */

export type HealthSetupState =
  | 'unavailable'    // no HealthKit on this device or build
  | 'notRequested'   // never asked
  | 'requested';     // the system sheet has been completed, whatever was chosen

/* ── raw samples, provenance intact ──────────────────────────── */

export interface QuantitySample {
  /** epoch ms, UTC */
  start: number;
  end: number;
  value: number;
  /** source bundle id — what wrote it, for de-duplication */
  source: string;
}

/** sleep analysis category values that COUNT AS ASLEEP. In-bed and
 *  awake intervals are not sleep and are never summed. */
export type SleepStage = 'asleep' | 'inBed' | 'awake';

export interface SleepSample {
  start: number;
  end: number;
  stage: SleepStage;
  source: string;
}

export interface WorkoutSample {
  /** HealthKit's stable UUID — the deduplication key */
  uuid: string;
  start: number;
  end: number;
  /** activity type name as the store reports it, e.g. 'walking' */
  activity: string;
  /** kcal, if the store had it */
  energy?: number;
  source: string;
}

export interface StateOfMindSample {
  ts: number;
  /** -1..1 valence as Health reports it */
  valence: number;
  /** 'momentaryEmotion' | 'dailyMood' */
  kind: string;
}

/* ── the normalized day ──────────────────────────────────────
   Keyed by LOCAL date, the same 'YYYY-MM-DD' the rest of the record
   uses. All times are minutes-since-local-midnight or epoch ms with the
   local conversion already applied by the caller-supplied clock (see
   LocalClock) — so a test can be in any time zone it likes. */

export interface NormalizedWorkout {
  uuid: string;
  /** minutes since local midnight of the day this workout is filed under */
  h: number;
  minutes: number;
  activity: string;
  energy?: number;
}

export interface HealthDay {
  /** local date this context describes */
  date: string;
  /** total asleep minutes of the night ENDING this morning */
  sleepMinutes?: number;
  /** epoch ms of that night's first and last asleep interval */
  sleepStart?: number;
  sleepEnd?: number;
  /** midnight-to-midnight local totals for this date */
  steps?: number;
  distanceMeters?: number;
  activeEnergyKcal?: number;
  /** minutes spent upright (Apple Watch stand time). UPRIGHT, not
   *  "not sitting": an hour without standing could be a couch, a car,
   *  or a watch on its charger, and the wording downstream keeps to
   *  what was measured. */
  standMinutes?: number;
  /** upright minutes per local hour, for hours-before-a-check-in sums */
  standHourly?: number[];
  /** steps per local hour, 24 slots, for "since the last check-in"
   *  arithmetic. Present only when steps are. A missing hour is 0 INSIDE
   *  a covered day — the coverage flag is what says "measured at all". */
  stepsHourly?: number[];
  workouts?: NormalizedWorkout[];
  restingHeartRate?: number;
  hrvSDNN?: number;
  stateOfMind?: { h: number; valence: number; kind: string }[];
  /** which categories actually produced data for this day — coverage is
   *  per-day and per-category, and a day outside coverage never joins a
   *  comparison group */
  coverage: Partial<Record<HealthCategory, true>>;
}

/** everything the store hands normalize.ts for one local date */
export interface DayRawBundle {
  date: string;
  sleep: SleepSample[];
  steps: QuantitySample[];
  distance: QuantitySample[];
  activeEnergy: QuantitySample[];
  stand: QuantitySample[];
  workouts: WorkoutSample[];
  restingHeartRate: QuantitySample[];
  hrvSDNN: QuantitySample[];
  stateOfMind: StateOfMindSample[];
}

/* ── the clock ───────────────────────────────────────────────
   Local-time arithmetic is injected, not assumed. The app injects the
   device's real calendar; a test injects a fixed offset, or one that
   jumps an hour mid-range to prove daylight-saving days do not
   double-file or lose samples. */

export interface LocalClock {
  /** the local date an instant falls on */
  dateOf(ts: number): string;
  /** minutes since local midnight for an instant */
  minutesOf(ts: number): number;
  /** epoch ms of local midnight beginning the given date */
  startOf(date: string): number;
}

/* ── the service boundary ────────────────────────────────────
   The one interface the app sees. HKHealthStore lives behind it in
   exactly one file; the mock implements it for tests and the
   Unavailable implementation is what every non-iOS or old-binary path
   gets. Read-only by design — there is no write method to misuse. */

export interface HealthService {
  /** is a health store present at all on this device and binary */
  available(): boolean;
  /** Present the system authorization sheet for the given categories.
   *  Resolves when the sheet completes — which says nothing about what
   *  was granted, and callers must not pretend otherwise. */
  requestAuthorization(categories: HealthCategory[]): Promise<void>;
  /** raw samples for one local date, for the categories asked. Never
   *  throws for an unauthorized type — it simply returns nothing, which
   *  is all HealthKit will say. */
  fetchDay(date: string, categories: HealthCategory[]): Promise<DayRawBundle>;
}
