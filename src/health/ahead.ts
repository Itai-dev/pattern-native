/**
 * What is booked, against the line — the calendar version of the load
 * budget, read the evening before.
 *
 * WHY THE CALENDAR AND NOT THE WRIST. The session that costs tomorrow
 * is decided before it starts: which class, how long, whether to go.
 * A buzz forty minutes into a class reaches nobody who can act on it,
 * reads as "stop" whatever it says, and needs a heart-rate detector
 * that mistakes stairs for a workout. The calendar already knows the
 * length of tomorrow's session, the person is looking at their phone
 * the evening before, and the decision is theirs to make — shorten,
 * move, skip, or go anyway. That is the honest real-time version:
 * real time is the night before.
 *
 * WHAT THIS RETURNS. At most one booked exertion — later today or
 * tomorrow — whose length is past the person's own line, with the
 * budget it is measured against. The calendar's title travels with
 * it because this is shown INSIDE the app, on the acting surface,
 * where the person can read their own calendar back; calendar.ts
 * still keeps titles out of every notification.
 *
 * WHAT IT NEVER DOES. Edit the calendar. The card's one action opens
 * Apple's own event editor, prefilled with the event as it is, and
 * only a tap on Save in that sheet changes anything. Pattern proposes
 * a look; the person decides. An app that shortened someone's gym
 * booking for them would have crossed from describing a record to
 * running a week.
 */
import { LoadBudget, BUDGET_NOTE_SHORT } from './budget';
import { PlanEvent, calendarKind } from './prompts';

/** a calendar event as this file reads it — the planner's shape, plus
 *  what Apple's editor needs to find it again. Structurally the same
 *  as calendar.ts's CalendarEvent, repeated so this file has no
 *  React Native import and runs under Node like the rest of health/. */
export interface AheadEvent extends PlanEvent {
  /** the store's event id — absent on a binary whose calendar module
   *  predates it, in which case the card has no editor to open */
  id?: string;
  /** the event's start as epoch ms, so a recurring event's instance
   *  can be named to the editor */
  start?: number;
}

export interface BookedAhead {
  /** the event's local date */
  date: string;
  when: 'today' | 'tomorrow';
  event: AheadEvent;
  budget: LoadBudget;
  /** minutes the booking runs past the line */
  overBy: number;
}

/** the key a dismissal is stored under — the event as booked, so a
 *  moved or shortened event is a new event and asks again */
export function aheadKey(date: string, e: PlanEvent): string {
  return date + '/' + e.h + '/' + e.minutes + '/' + e.title;
}

/**
 * The next booked exertion past the line, or null.
 *
 * Today's events count only if they have not started; tomorrow's all
 * do. Earliest first, one at most — two long sessions in two days is
 * still one card, about the nearer one, because the point is the next
 * decision and not a list. "Past the line" is strictly past: a booking
 * exactly at the line is at it, not over it.
 */
export function bookedPastLine(
  events: Record<string, AheadEvent[]>,
  budget: LoadBudget | null,
  todayIso: string,
  tomorrowIso: string,
  nowMinutes: number,
  dismissed: string[] = []
): BookedAhead | null {
  if (!budget) return null;
  const days: { date: string; when: 'today' | 'tomorrow' }[] = [
    { date: todayIso, when: 'today' }, { date: tomorrowIso, when: 'tomorrow' },
  ];
  for (const d of days) {
    const list = (events[d.date] || [])
      .filter((e) => calendarKind(e.title) === 'exertion')
      .filter((e) => d.when === 'tomorrow' || e.h > nowMinutes)
      .filter((e) => e.minutes > budget.pastMinutes)
      .filter((e) => dismissed.indexOf(aheadKey(d.date, e)) < 0)
      .sort((a, b) => a.h - b.h);
    if (list.length) {
      const e = list[0];
      return { date: d.date, when: d.when, event: e, budget, overBy: e.minutes - budget.pastMinutes };
    }
  }
  return null;
}

/** the card's body — the record's sentence about this length, and
 *  what it is not. The eyebrow (which event, when) is composed by the
 *  screen, which owns the clock's formatting. Deterministic: same
 *  numbers, same words. */
export function aheadBody(b: BookedAhead): string {
  return 'That is ' + b.overBy + (b.overBy === 1 ? ' minute' : ' minutes') + ' past '
    + b.budget.pastMinutes + ', where your next mornings ran harder. Your usual is about '
    + b.budget.usualMinutes + '. ' + BUDGET_NOTE_SHORT;
}
