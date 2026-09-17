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

/** the Profile switch. Off by default: the current Today is what ships
 *  until the comparison says otherwise. */
export const PREF_TODAY_LAYERED = 'today.layered';

export interface ContextTile {
  key: 'sleep' | 'steps' | 'workouts';
  label: string;
  /** the measured value, short: "6h 40m", "8,210", "45 min" */
  value: string;
  /** the remark against the person's usual, or '' when there is none */
  sub: string;
}

/** the label each tile wears, and the phrase that ends the value in the
 *  sentence it is cut from */
const CUTS: { key: ContextTile['key']; label: string; ends: string[] }[] = [
  { key: 'sleep', label: 'Slept', ends: [' asleep the night before', ' in bed the night before'] },
  { key: 'steps', label: 'Steps', ends: [' steps'] },
  { key: 'workouts', label: 'Workout', ends: [' workout', ' total'] },
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
    /* "2 workouts · 1h 30m" keeps its middle dot: two sessions is a fact
       worth the width */
    out.push({ key, label: key === 'workouts' && value.indexOf('·') >= 0 ? 'Workouts' : label, value, sub });
  });
  return out;
}
