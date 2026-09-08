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
   Each expands to concrete sample kinds below. The user picks
   categories; the adapter requests only the underlying types those
   categories name.

   HEART IS OFF THE SHEET. It is imported and normalised and licenses
   no association — a tile on the day screen and nothing else, and a
   permission sheet is where trust is decided, so it is not asked for.
   The code path stays for anyone who connected it earlier. State of
   Mind was off for the same reason until it earned a comparison
   (mindVsEvening, 8 Sep 2026); the flag below is one word either way. */

export type HealthCategory =
  | 'sleep'
  | 'movement'   // steps, distance, active energy
  | 'workouts'
  | 'heart'      // resting HR, HRV (SDNN) — imported, never analysed in v1
  | 'mind'       // State of Mind — the day's moods, beside the evening's pain
  /* Doses logged in the Health app (iOS 26's medication log). Read
   * through Apple's per-medication picker, so the person chooses which
   * medications Pattern may see, one by one. Compared before-and-after
   * a dose, never day against day — see doses.ts. */
  | 'medications'
  /* Water, caffeine and drinks, as logged in Health (by hand, or by an
   * app that writes them). Water and caffeine accumulate before the
   * evening check-in; drinks are yesterday's, beside this morning. */
  | 'nutrition';

export const HEALTH_CATEGORIES: {
  id: HealthCategory; name: string; blurb: string;
  /** may the setup sheet offer it — false keeps the category readable
   *  for anyone who already connected it, and asks nobody new */
  offered: boolean;
}[] = [
  {
    id: 'sleep', name: 'Sleep', offered: true,
    blurb: 'How long you slept, from the Health app’s sleep record.',
  },
  {
    id: 'movement', name: 'Daily movement', offered: true,
    blurb: 'Steps, walking distance, active energy — and time upright, from an Apple Watch, for how much of the day was spent sitting still.',
  },
  {
    id: 'workouts', name: 'Workouts', offered: true,
    blurb: 'Workouts you or your watch recorded, with their time and length.',
  },
  {
    id: 'heart', name: 'Heart and recovery', offered: false,
    blurb: 'Resting heart rate and heart-rate variability. Kept as context — Pattern draws no conclusions from them.',
  },
  {
    id: 'medications', name: 'Medications', offered: true,
    blurb: 'Doses you log in the Health app — which medication, and when. You pick which ones to share. Shown beside the day, and compared with your check-ins before and after a dose. Needs iOS 26.',
  },
  {
    id: 'nutrition', name: 'Water, caffeine and drinks', offered: true,
    blurb: 'What you log in Health as water, caffeine and alcoholic drinks. Water and caffeine through the day sit beside the evening’s pain; drinks beside the next morning’s.',
  },
  {
    id: 'mind', name: 'State of Mind', offered: true,
    blurb: 'Moods you log in Health, where your iOS version supports it. Said back before the stress and fatigue questions, and set beside your evening pain — as things that move together, never as one causing the other.',
  },
];

/** what the setup sheet shows: the offered categories, plus any the
 *  person already connected before a category stopped being offered —
 *  a row that vanished while still granted would be a switch they can
 *  no longer turn off */
export function offeredCategories(already: HealthCategory[]): typeof HEALTH_CATEGORIES {
  return HEALTH_CATEGORIES.filter((c) => c.offered || already.indexOf(c.id) >= 0);
}

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

/** one dose event from the Health app's medication log. `status` is
 *  what the person logged: taken, skipped, or a reminder they never
 *  answered ('other'), which is silence and never a value. */
export interface DoseSample {
  ts: number;
  /** HealthKit's stable medication concept identifier — the grouping key */
  medId: string;
  /** the medication's name as Health shows it */
  med: string;
  status: 'taken' | 'skipped' | 'other';
  /** how much, in the medication's own unit, when Health had it */
  qty?: number;
  unit?: string;
  /** part of a schedule, or taken as needed */
  scheduled: boolean;
}

export interface StateOfMindSample {
  ts: number;
  /** -1..1 valence as Health reports it */
  valence: number;
  /** 'momentaryEmotion' | 'dailyMood' */
  kind: string;
  /** the words the person attached — 'stressed', 'calm' — as Apple
   *  names them, lower-case. Absent when none were chosen. */
  labels?: string[];
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

/** a dose as the day carries it: filed at its local minute, taken or
 *  skipped only — an unanswered reminder is not on the day */
export interface NormalizedDose {
  h: number;
  medId: string;
  med: string;
  status: 'taken' | 'skipped';
  qty?: number;
  unit?: string;
}

export interface HealthDay {
  /** local date this context describes */
  date: string;
  /** total asleep minutes of the night ENDING this morning — or, when
   *  the store holds no asleep interval at all, time in bed (see
   *  sleepKind). An iPhone with a sleep schedule and no watch writes
   *  only in-bed intervals; without the fallback those people have no
   *  sleep in Pattern at all. */
  sleepMinutes?: number;
  /** what sleepMinutes measures. Absent reads as 'asleep'. A record is
   *  compared on ONE kind only — see windows.ts — because minutes in
   *  bed and minutes asleep are not the same quantity. */
  sleepKind?: 'asleep' | 'inBed';
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
  /** water logged this date, millilitres, and per local hour */
  waterMl?: number;
  waterHourly?: number[];
  /** caffeine logged this date, milligrams, and per local hour */
  caffeineMg?: number;
  caffeineHourly?: number[];
  /** alcoholic drinks logged this date. Present on any day with
   *  nutrition coverage: a day where water or caffeine was logged and
   *  no drink is a day with none — the one place this record reads an
   *  absence as a zero, because nobody logs "no drinks", and the timing
   *  sentence says so. */
  alcoholDrinks?: number;
  restingHeartRate?: number;
  hrvSDNN?: number;
  stateOfMind?: { h: number; valence: number; kind: string; labels?: string[] }[];
  /** doses logged in Health this day, in time order. Present only on a
   *  day with at least one taken or skipped dose — an empty list would
   *  claim "nothing taken", and an unlogged dose is not that. */
  doses?: NormalizedDose[];
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
  water: QuantitySample[];
  caffeine: QuantitySample[];
  alcohol: QuantitySample[];
  stateOfMind: StateOfMindSample[];
  doses: DoseSample[];
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
  /** can this device and binary read the category at all — iOS 26's
   *  medication log is absent from older phones, and a row the phone
   *  cannot honour must not be offered */
  supports(category: HealthCategory): boolean;
  /** Present the system authorization sheet for the given categories.
   *  Resolves when the sheet completes — which says nothing about what
   *  was granted, and callers must not pretend otherwise. */
  requestAuthorization(categories: HealthCategory[]): Promise<void>;
  /** raw samples for one local date, for the categories asked. Never
   *  throws for an unauthorized type — it simply returns nothing, which
   *  is all HealthKit will say. */
  fetchDay(date: string, categories: HealthCategory[]): Promise<DayRawBundle>;
}
