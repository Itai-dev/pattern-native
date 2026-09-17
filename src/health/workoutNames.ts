/**
 * What a workout was, in a word.
 *
 * HealthKit reports a workout's activity as a numeric type code, and the
 * app stored the code as a string and summarised workouts by time alone
 * — "2 workouts · 39 min". That lost the one thing a person with pain
 * wants to see beside a number: WHICH activity it was. A swim and a run
 * are not the same load on the same body, and a record that cannot tell
 * them apart cannot later ask whether one of them goes with easier
 * mornings. So the code becomes a plain name here, once, for every
 * surface: the tiles, the day lines, the check-in's "after a workout"
 * hint.
 *
 * Names are Apple's own activity list in plain English, lower-cased so
 * they can sit inside a sentence. A code the table does not know reads
 * as "workout" — never as a number, and never dropped. Legacy records
 * written before the codes were captured carry a word already ('walk',
 * 'run' in the tests) and are shown as that word.
 */

/** HKWorkoutActivityType → a plain name. The numbers are Apple's and
 *  stable; the table is the library's enum, renamed for reading. */
const NAMES: Record<string, string> = {
  1: 'American football', 2: 'archery', 3: 'Australian football', 4: 'badminton',
  5: 'baseball', 6: 'basketball', 7: 'bowling', 8: 'boxing', 9: 'climbing',
  10: 'cricket', 11: 'cross training', 12: 'curling', 13: 'cycling', 14: 'dance',
  15: 'dance training', 16: 'elliptical', 17: 'equestrian', 18: 'fencing',
  19: 'fishing', 20: 'strength training', 21: 'golf', 22: 'gymnastics',
  23: 'handball', 24: 'hiking', 25: 'hockey', 26: 'hunting', 27: 'lacrosse',
  28: 'martial arts', 29: 'mind and body', 30: 'cardio training', 31: 'paddling',
  32: 'play', 33: 'recovery', 34: 'racquetball', 35: 'rowing', 36: 'rugby',
  37: 'running', 38: 'sailing', 39: 'skating', 40: 'snow sports', 41: 'football',
  42: 'softball', 43: 'squash', 44: 'stair climbing', 45: 'surfing', 46: 'swimming',
  47: 'table tennis', 48: 'tennis', 49: 'track and field', 50: 'strength training',
  51: 'volleyball', 52: 'walking', 53: 'water fitness', 54: 'water polo',
  55: 'water sports', 56: 'wrestling', 57: 'yoga', 58: 'barre', 59: 'core training',
  60: 'cross-country skiing', 61: 'downhill skiing', 62: 'flexibility', 63: 'HIIT',
  64: 'jump rope', 65: 'kickboxing', 66: 'pilates', 67: 'snowboarding', 68: 'stairs',
  69: 'step training', 70: 'wheelchair walk', 71: 'wheelchair run', 72: 'tai chi',
  73: 'mixed cardio', 74: 'hand cycling', 75: 'disc sports', 76: 'fitness gaming',
  77: 'cardio dance', 78: 'social dance', 79: 'pickleball', 80: 'cooldown',
  82: 'swim bike run', 83: 'transition', 84: 'underwater diving', 3000: 'workout',
};

/** the activity as stored → a plain lower-case name, or 'workout' */
export function workoutName(activity: string | undefined | null): string {
  if (!activity) return 'workout';
  const s = String(activity).trim();
  if (/^\d+$/.test(s)) return NAMES[s] || 'workout';
  /* a word already (legacy or a library that names types): read as is,
     camelCase split for the library's own identifiers */
  const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced === 'other' ? 'workout' : spaced;
}

/** the distinct activity names of a day's workouts, in the order they
 *  happened — "swimming, walking". Two swims are one name. */
export function workoutKinds(workouts: { activity: string }[]): string[] {
  const out: string[] = [];
  workouts.forEach((w) => {
    const n = workoutName(w.activity);
    if (out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

/** a name with its first letter up, for the head of a line or a tile */
export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface WorkoutSummary {
  /** "Workout" or "2 workouts" — the count is a count, so it is a label */
  label: string;
  /** the time, total: "39 min", "1h 30m" */
  value: string;
  /** what it was: "swimming" or "swimming, walking" */
  kinds: string;
  count: number;
  totalMinutes: number;
}

/** one day's workouts as a tile would carry them, or null for none */
export function workoutSummary(
  workouts: { activity: string; minutes: number }[] | undefined,
  fmtDuration: (min: number) => string
): WorkoutSummary | null {
  const w = workouts || [];
  if (!w.length) return null;
  const total = w.reduce((s, x) => s + x.minutes, 0);
  return {
    label: w.length === 1 ? 'Workout' : w.length + ' workouts',
    value: fmtDuration(total),
    kinds: workoutKinds(w).join(', '),
    count: w.length,
    totalMinutes: total,
  };
}
