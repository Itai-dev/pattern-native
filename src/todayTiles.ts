/**
 * The context tiles on the layered Today: what went with the number.
 *
 * Three small neutral tiles under the last check-in — slept, steps,
 * workout — each a value and, where the person's own usual says
 * something, one quiet line about it. They are built from the SAME
 * sentences `healthDayLines` already writes for the day screen, cut into
 * a value and a remark, so the thresholds for "less than your usual" and
 * the wording for in-bed versus asleep live in one place and the tiles
 * cannot drift from the lines.
 *
 * What a tile is not: a score, a target, a ring or a colour. White
 * numbers on a neutral surface, and a missing category is simply not a
 * tile — never a zero, never an empty ring. The comparison a tile makes
 * is to the person's own usual for THAT factor and never to their pain;
 * the pain sits in the square above and the reader may notice the two
 * together, which is theirs to notice.
 */
import { HealthDay } from './health/types';
import { healthDayLines } from './health/context';
import { workoutSummary } from './health/workoutNames';

/** the Profile switch. Off by default: the current Today is what ships
 *  until the comparison says otherwise. */
export const PREF_TODAY_LAYERED = 'today.layered';

export interface ContextTile {
  key: 'sleep' | 'steps' | 'workouts';
  /** "Slept", "Steps", "Workout", "2 workouts" — a count is a label */
  label: string;
  /** the measured value, short: "6h 40m", "8,210", "45 min" */
  value: string;
  /** the remark: against the person's usual for sleep and steps, or
   *  what the workout was ("swimming"); '' when there is none */
  sub: string;
}

/** the label each tile wears, and the phrase that ends the value in the
 *  sentence it is cut from */
const CUTS: { key: ContextTile['key']; label: string; ends: string[] }[] = [
  { key: 'sleep', label: 'Slept', ends: [' asleep the night before', ' in bed the night before'] },
  { key: 'steps', label: 'Steps', ends: [' steps'] },
];

/** a healthDayLines sentence → value and remark. The remark is what
 *  follows the em dash, tidied to start lower-case and read on its own:
 *  "about 1h less than your usual". */
export function splitLine(text: string, ends: string[]): { value: string; sub: string } {
  const dash = text.indexOf(' — ');
  let value = dash >= 0 ? text.slice(0, dash) : text;
  const sub = dash >= 0 ? text.slice(dash + 3).trim() : '';
  for (const e of ends) {
    if (value.endsWith(e)) { value = value.slice(0, value.length - e.length); break; }
  }
  return { value: value.trim(), sub };
}

/** the tiles for one day, in a fixed order, only where data exists */
export function contextTiles(
  day: HealthDay | null | undefined,
  all?: Record<string, HealthDay>
): ContextTile[] {
  const lines = healthDayLines(day, all);
  const out: ContextTile[] = [];
  CUTS.forEach(({ key, label, ends }) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const { value, sub } = splitLine(line.text, ends);
    if (!value) return;
    out.push({ key, label, value, sub });
  });
  /* the workout tile is not cut from its sentence: the time is the value
     ("39 min"), the count is the label ("2 workouts") and the activity is
     the remark ("swimming, walking"). The first version put the count and
     the time together in the value and it shrank to fit — a tile that
     reads smaller than its neighbours reads as less true. */
  const ws = workoutSummary(day ? day.workouts : undefined, (min) => {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h === 0 ? m + ' min' : h + 'h' + (m ? ' ' + m + 'm' : '');
  });
  if (ws) out.push({ key: 'workouts', label: ws.label, value: ws.value, sub: ws.kinds });
  return out;
}
