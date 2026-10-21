/**
 * Words for a before/after record that formed but is not a finding —
 * the workouts' and the doses' (workouts.ts, doses.ts), said one way.
 *
 * WHY THIS EXISTS (21 Oct 2026). The owner, on a phone, looking at
 * "Swimming, before and after": 4.8 before, 4.2 after, "10 workouts"
 * printed on both rows, and the words "No meaningful change". Was it
 * ten swims or twenty? Why was a drop "no change"? The engine was
 * right — 0.6 points is short of the 1.5 HEALTH_MIN_DELTA asks for —
 * and the screen explained none of it. So the sentence now says:
 *
 *   1. what happened, in words and in the person's own units
 *      ("After 10 swimming sessions, your pain averaged 0.6 lower than
 *      before");
 *   2. how many sessions went each way — the description a person can
 *      check against their own memory of those sessions;
 *   3. and, in OBSERVATION_WHY, why that is not called a finding yet,
 *      with the threshold's number in it.
 *
 * WHAT IT STILL NEVER SAYS: that the session helped or hurt. "Lower
 * after" is what the check-ins recorded; whether the swim is why is
 * exactly what a before/after record cannot answer on its own (the
 * non-causation lines in workouts.ts and doses.ts). No verdict word, no
 * colour — counts are white, only pain values take the ramp.
 */
import { HEALTH_MIN_DELTA } from '../thresholds';

/** how many before/after pairs went each way. "Same" is the same
 *  whole number, which is all a 0–10 check-in can say. */
export function directionCounts(pairs: { before: number; after: number }[]): {
  lower: number; same: number; higher: number;
} {
  let lower = 0, same = 0, higher = 0;
  pairs.forEach((p) => {
    if (p.after < p.before) lower++;
    else if (p.after > p.before) higher++;
    else same++;
  });
  return { lower, same, higher };
}

const pts = (v: number) => v + (v === 1 ? ' point' : ' points');

/** "Lower after 7 of them, the same after 1, higher after 2." — the
 *  zero cases left out, so a clean record reads cleanly */
export function countsSentence(c: { lower?: number; same?: number; higher?: number }): string {
  const parts: string[] = [];
  if (c.lower) parts.push('lower after ' + c.lower);
  if (c.same) parts.push('the same after ' + c.same);
  if (c.higher) parts.push('higher after ' + c.higher);
  if (!parts.length) return '';
  const s = parts.length === 1 ? parts[0] + ' of them'
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** the observation's one line: the average change in words, then the
 *  sessions counted by direction */
export function pairedChange(lead: string, a: {
  delta?: number; lower?: number; same?: number; higher?: number;
}): string {
  const d = a.delta == null ? 0 : a.delta;
  const change = d === 0
    ? 'your pain averaged the same as before.'
    : 'your pain averaged ' + pts(Math.abs(d)) + (d < 0 ? ' lower' : ' higher') + ' than before.';
  const counts = countsSentence(a);
  return lead + ', ' + change + (counts ? ' ' + counts : '');
}

/** why a change this size is not called a finding — said beside it,
 *  with the number that decides it */
export const OBSERVATION_WHY =
  'Pattern calls a before-and-after change a finding at ' + HEALTH_MIN_DELTA + ' points on average, '
  + 'because two check-ins a few hours apart often differ by about a point on their own. '
  + 'This is smaller than that so far, so it is shown as what happened, not as what caused it. '
  + 'Each new session with a check-in before and after adds to it.';
