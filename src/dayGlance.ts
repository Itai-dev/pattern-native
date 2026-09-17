/**
 * The words under a tapped dot on the layered day page — pure, so the
 * screen has nothing to compute and the test can pin the sentences.
 *
 * The day page used to list every check-in as a row. Now the chart is
 * the list: tap a dot and the moment reads back underneath it. What
 * reads back is what was entered, in the words it was entered in — the
 * places, the qualities, the symptoms as chips, and the user's own
 * phrase about where in quotes — and one temporal fact: the event it
 * came after, if the day had one. "After" is when, never why. The
 * event sheet's own caveat still holds here: an event beside a number
 * is not a claim about the number.
 */
import {
  EVENT_LABELS, EventKind, LOC_NAMES, Moment, QUALITY_NAMES, SYMPTOM_NAMES,
} from './model';

/** what the chart needs to know about an event: when, and what to call it */
export interface GlanceEvent { h: number; kind: EventKind }

/** the moment a chart lands on before anyone taps: the newest one, which
 *  is also the one Today's hero shows — so the two agree on arrival */
export function latestH(logs: Moment[]): number | undefined {
  if (!logs.length) return undefined;
  return logs.reduce((m, l) => (l.h > m ? l.h : m), logs[0].h);
}

/** the moment to show for a day: the tapped one while it still exists,
 *  otherwise the newest. A deleted moment must not leave the card on a
 *  dot that is no longer drawn. */
export function shownH(logs: Moment[], tapped: number | undefined): number | undefined {
  if (tapped != null && logs.some((l) => l.h === tapped)) return tapped;
  return latestH(logs);
}

/** the most recent event of the day at or before this minute, or null */
export function eventBefore<E extends GlanceEvent>(events: E[], h: number): E | null {
  let best: E | null = null;
  events.forEach((ev) => {
    if (ev.h <= h && (!best || ev.h > best.h)) best = ev;
  });
  return best;
}

/** "after the flare at 11:30" — a fact about the order of the day and
 *  nothing more. The label is the event sheet's own, lower-cased; the
 *  catch-all kind reads as "after something else" because "after the
 *  something else" is not a sentence. */
export function afterLine(ev: GlanceEvent | null, fmt: (h: number) => string): string {
  if (!ev) return '';
  const label = EVENT_LABELS[ev.kind] || 'event';
  return (ev.kind === 'other' ? 'after ' : 'after the ') + label.toLowerCase() + ' at ' + fmt(ev.h);
}

/** the chips under the number: places, the user's own words about
 *  where (quoted, so the record's voice and theirs stay distinct),
 *  qualities, then symptoms — the order the check-in asks them in.
 *  Unknown ids are shown as themselves rather than dropped: a chip the
 *  vocabulary has forgotten is still something the person said. */
export function chipsFor(m: Moment): string[] {
  const out: string[] = [];
  (m.loc || []).forEach((id) => out.push(LOC_NAMES[id] || id));
  if (m.locNote) out.push('“' + m.locNote + '”');
  (m.q || []).forEach((id) => out.push(QUALITY_NAMES[id] || id));
  (m.sym || []).forEach((id) => out.push(SYMPTOM_NAMES[id] || id));
  return out;
}
