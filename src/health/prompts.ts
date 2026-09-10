/**
 * When to ask — the reminder plan, learned from Apple Health.
 *
 * Three fixed times a day was the whole schedule, and a fixed time is
 * wrong for most of the questions this record is trying to answer.
 * "How is the morning after that night" wants asking after the person
 * actually woke, not at eight; "how are you after a workout" wants the
 * forty-five minutes after the workout, on the days one happens; "how
 * is it an hour after the tablet" wants the hour after the tablet. So
 * this file reads what Health already knows about the person's days —
 * when they wake and go to bed, when they usually finish a workout,
 * when they usually log a dose — and turns it into the day's prompts.
 * Pure, clock-injected, and testable in Node like the rest of health/.
 *
 * WHAT IT MAY NOT DO. Prompt more than PROMPTS_MAX_PER_DAY times, or
 * twice within PROMPT_MIN_GAP_MIN: a record kept under a barrage is a
 * record abandoned. Move a time the person set by hand unless Health
 * has enough nights to know better — and then only within the band the
 * slot belongs to, so "morning" stays a morning — though a learned
 * after-prompt within the gap of a slot takes that slot's place for
 * the day, because both ask the same question and only one of them
 * knows why. Name a medication in
 * a notification: it lands on a lock screen. Predict: an "after your
 * workout" prompt is scheduled at the hour a workout USUALLY ends on
 * that weekday, and its words say "often", because the phone cannot
 * know whether today had one. (True event-driven prompts need
 * HealthKit background delivery, a native entitlement — the next
 * binary's job, and the plan here is what it will refine.)
 *
 * TYPICAL means the MEDIAN over the recent window, never the mean: one
 * 4 a.m. night must not drag the morning prompt to six.
 */
import { addDays } from '../model';
import { bandOf } from '../metrics';
import {
  PROMPTS_MAX_PER_DAY, PROMPT_AFTER_DOSE_MIN, PROMPT_AFTER_WAKE_MIN,
  PROMPT_AFTER_WORKOUT_MIN, PROMPT_BEFORE_BED_MIN, PROMPT_BEFORE_WORKOUT_MIN, PROMPT_DOSE_SEPARATION_MIN,
  PROMPT_EARLIEST_MIN, PROMPT_LATEST_MIN, PROMPT_MIN_DAYS, PROMPT_MIN_GAP_MIN,
  PROMPT_MIN_RECURRENCE, PROMPT_SLEEP_DAYS, PROMPT_WORKOUT_WEEKS,
} from '../thresholds';
import { HealthDay, LocalClock } from './types';
import { LoadBudget, budgetNotification } from './budget';

/** the shape reminders.ts saves — repeated here so this file never
 *  imports the notification library and can run in Node */
export interface SlotLike {
  key: 'm' | 'd' | 'e';
  hour: number;
  minute: number;
  on: boolean;
}

/* `budget` is the one prompt that asks NOTHING: the person's own load
   budget, delivered before the workout it is about (see budget.ts).
   It is the first proactive sentence in the app, and it obeys every
   rule the asking prompts do — the cap, the gap, the waking window —
   because a sentence at the wrong moment is a nag whatever it says. */
export type PromptKind = 'm' | 'd' | 'e' | 'workout' | 'dose' | 'calendar' | 'budget';

export interface Prompt {
  /** stable within a day — the notification identifier is built from it */
  key: string;
  /** minutes since local midnight */
  h: number;
  kind: PromptKind;
  /** true when Health moved a slot from the time the person set */
  adapted?: boolean;
  /** the notification's words when they carry the person's own
   *  numbers — absent, the kind's fixed copy is used */
  body?: string;
}

const median = (a: number[]): number => {
  const s = a.slice().sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** the recent days of the record before (never including) `date` */
function recent(health: Record<string, HealthDay>, date: string, days: number): HealthDay[] {
  const from = addDays(date, -days);
  return Object.keys(health)
    .filter((k) => k < date && k >= from)
    .sort()
    .map((k) => health[k]);
}

/** when the person usually wakes — the median end of the last
 *  PROMPT_SLEEP_DAYS nights, once PROMPT_MIN_DAYS of them exist */
export function typicalWake(
  health: Record<string, HealthDay>, date: string, clock: LocalClock
): number | null {
  const ends = recent(health, date, PROMPT_SLEEP_DAYS)
    .filter((d) => d.sleepEnd != null)
    .map((d) => clock.minutesOf(d.sleepEnd as number));
  return ends.length >= PROMPT_MIN_DAYS ? median(ends) : null;
}

/** when the person usually goes to sleep. Bedtimes straddle midnight,
 *  so minutes before noon are read as the next day (23:40 and 00:20
 *  are forty minutes apart, not twenty-three hours) before the median,
 *  and folded back after. */
export function typicalBedtime(
  health: Record<string, HealthDay>, date: string, clock: LocalClock
): number | null {
  const starts = recent(health, date, PROMPT_SLEEP_DAYS)
    .filter((d) => d.sleepStart != null)
    .map((d) => { const m = clock.minutesOf(d.sleepStart as number); return m < 720 ? m + 1440 : m; });
  if (starts.length < PROMPT_MIN_DAYS) return null;
  return median(starts) % 1440;
}

/** the weekday of a local date, 0 = Sunday, from the date alone */
export function weekdayOf(date: string): number {
  const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  return d.getDay();
}

/** when a workout usually ENDS on this weekday — the median end of the
 *  day's last workout over the same weekday in the last
 *  PROMPT_WORKOUT_WEEKS weeks, once PROMPT_MIN_RECURRENCE of those
 *  weekdays had one. A Tuesday class is a Tuesday fact; a Saturday
 *  run says nothing about Wednesday. */
export function typicalWorkoutEnd(health: Record<string, HealthDay>, date: string): number | null {
  const ends: number[] = [];
  for (let w = 1; w <= PROMPT_WORKOUT_WEEKS; w++) {
    const d = health[addDays(date, -7 * w)];
    const ws = d && d.workouts ? d.workouts : [];
    if (!ws.length) continue;
    let end = 0;
    ws.forEach((x) => { end = Math.max(end, x.h + x.minutes); });
    ends.push(end);
  }
  return ends.length >= PROMPT_MIN_RECURRENCE ? median(ends) : null;
}

/** when a workout usually STARTS on this weekday — the median start
 *  of the day's first workout, over the same weekdays and under the
 *  same recurrence rule as the end. The budget is about the session
 *  ahead, so it wants the first one, where the end prompt wants the
 *  last. */
export function typicalWorkoutStart(health: Record<string, HealthDay>, date: string): number | null {
  const starts: number[] = [];
  for (let w = 1; w <= PROMPT_WORKOUT_WEEKS; w++) {
    const d = health[addDays(date, -7 * w)];
    const ws = d && d.workouts ? d.workouts : [];
    if (!ws.length) continue;
    let start = 1440;
    ws.forEach((x) => { start = Math.min(start, x.h); });
    starts.push(start);
  }
  return starts.length >= PROMPT_MIN_RECURRENCE ? median(starts) : null;
}

/** the times of day a dose is usually logged — peaks in the last
 *  PROMPT_SLEEP_DAYS days' taken doses, any medication, counted in
 *  DISTINCT DAYS per half-hour (a day with three doses at eight is one
 *  eight-o'clock day). A peak needs PROMPT_MIN_DAYS days, and two
 *  peaks keep PROMPT_DOSE_SEPARATION_MIN apart so a dose logged at
 *  8:00 and 8:20 on alternate days is one habit, not two prompts. */
export function typicalDoseTimes(health: Record<string, HealthDay>, date: string): number[] {
  const BUCKET = 30;
  const n = 1440 / BUCKET;
  const dayset: Record<string, true>[] = [];
  for (let i = 0; i < n; i++) dayset.push({});
  recent(health, date, PROMPT_SLEEP_DAYS).forEach((d) => {
    (d.doses || []).forEach((x) => {
      if (x.status !== 'taken') return;
      const b = Math.floor(x.h / BUCKET) % n;
      /* a dose credits its own bucket and its neighbours, so a habit
         that straddles a half-hour line is still one peak */
      [b - 1, b, b + 1].forEach((k) => { dayset[(k + n) % n][d.date] = true; });
    });
  });
  const counts = dayset.map((s) => Object.keys(s).length);
  const order = counts.map((c, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);
  const peaks: number[] = [];
  order.forEach((b) => {
    if (counts[b] < PROMPT_MIN_DAYS) return;
    const center = b * BUCKET + BUCKET / 2;
    if (peaks.some((p) => Math.abs(p - center) < PROMPT_DOSE_SEPARATION_MIN)) return;
    peaks.push(center);
  });
  return peaks.sort((a, b) => a - b);
}

/** one calendar event as the planner reads it */
export interface PlanEvent {
  h: number;
  minutes: number;
  title: string;
}

/* the words that make a calendar entry an exertion — the kind of
   event with an "after" worth asking about. Short and plain on
   purpose: a person can see why their "Pilates" earned a prompt and
   their "Lunch with Dana" did not. Matched as whole words, any case. */
const EXERTION_WORDS = [
  'gym', 'workout', 'training', 'run', 'running', 'jog', 'swim', 'swimming', 'cycle',
  'cycling', 'bike', 'ride', 'yoga', 'pilates', 'physio', 'physiotherapy', 'pt',
  'rehab', 'class', 'hike', 'walk', 'football', 'soccer', 'tennis', 'padel', 'climb',
  'climbing', 'crossfit', 'boxing', 'dance', 'garden', 'gardening', 'move', 'moving',
  'flight', 'drive', 'roadtrip',
];
const APPOINTMENT_WORDS = [
  'doctor', 'dr', 'gp', 'clinic', 'hospital', 'appointment', 'neurologist',
  'rheumatologist', 'orthopedic', 'orthopaedic', 'pain clinic', 'specialist', 'consult',
];

/** what an event title reads as — or null for the many that are
 *  neither. Exertion earns an after-event prompt; an appointment is
 *  kept for the day the app offers it as the next appointment. */
export function calendarKind(title: string): 'exertion' | 'appointment' | null {
  const t = ' ' + title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ') + ' ';
  const has = (w: string) => t.indexOf(' ' + w + ' ') >= 0;
  if (APPOINTMENT_WORDS.some(has)) return 'appointment';
  if (EXERTION_WORDS.some(has)) return 'exertion';
  return null;
}

export interface PlanInput {
  slots: SlotLike[];
  health: Record<string, HealthDay>;
  clock: LocalClock;
  /** false = the person's own times, untouched, and no Health prompts */
  adaptive: boolean;
  /** the date's calendar events, when the person turned the calendar
   *  on — exertion earns an after-event prompt like a workout habit */
  calendar?: PlanEvent[];
  /** the person's load budget, when their record has earned one —
   *  delivered before the usual workout. Absent or null: no such
   *  prompt, and nothing else changes. */
  budget?: LoadBudget | null;
}

/**
 * The prompts for one date, in time order — the slots the person turned
 * on (moved by Health where it knows better and the move stays inside
 * the slot's band), then the after-workout and after-dose prompts that
 * fit around them. Never more than PROMPTS_MAX_PER_DAY, never two
 * within PROMPT_MIN_GAP_MIN, never outside the waking window.
 */
export function planDay(date: string, input: PlanInput): Prompt[] {
  const out: Prompt[] = [];
  const wake = input.adaptive ? typicalWake(input.health, date, input.clock) : null;
  const bed = input.adaptive ? typicalBedtime(input.health, date, input.clock) : null;

  input.slots.forEach((s) => {
    if (!s.on) return;
    const own = s.hour * 60 + s.minute;
    let h = own;
    let adapted = false;
    if (s.key === 'm' && wake != null) {
      const cand = wake + PROMPT_AFTER_WAKE_MIN;
      if (bandOf(cand) === 'morning') { h = cand; adapted = true; }
    }
    if (s.key === 'e' && bed != null) {
      const cand = ((bed - PROMPT_BEFORE_BED_MIN) + 1440) % 1440;
      /* an evening slot stays in the evening: a 2 a.m. bedtime does
         not make "before bed" a night prompt */
      if (bandOf(cand) === 'evening') { h = cand; adapted = true; }
    }
    out.push({ key: s.key, h, kind: s.key, ...(adapted ? { adapted: true } : {}) });
  });

  if (input.adaptive) {
    const extra: Prompt[] = [];
    const wEnd = typicalWorkoutEnd(input.health, date);
    if (wEnd != null) extra.push({ key: 'w', h: wEnd + PROMPT_AFTER_WORKOUT_MIN, kind: 'workout' });
    typicalDoseTimes(input.health, date).forEach((t, i) => {
      extra.push({ key: 'x' + i, h: t + PROMPT_AFTER_DOSE_MIN, kind: 'dose' });
    });
    /* the calendar's exertions: a known end, on a known day — the one
       "after" the phone can be sure of in advance */
    (input.calendar || []).forEach((e, i) => {
      if (calendarKind(e.title) !== 'exertion') return;
      extra.push({ key: 'c' + i, h: e.h + e.minutes + PROMPT_AFTER_WORKOUT_MIN, kind: 'calendar' });
    });
    const isSlot = (q: Prompt) => q.kind === 'm' || q.kind === 'd' || q.kind === 'e';
    extra.sort((a, b) => a.h - b.h).forEach((p) => {
      if (p.h < PROMPT_EARLIEST_MIN || p.h > PROMPT_LATEST_MIN) return;
      /* two learned prompts keep the gap between them */
      if (out.some((q) => !isSlot(q) && Math.abs(q.h - p.h) < PROMPT_MIN_GAP_MIN)) return;
      /* a slot within the gap YIELDS to the learned prompt for that day:
         both ask the same question, and the learned one asks it at the
         hour the record needs — an evening slot at eight and an
         after-workout prompt at a quarter to seven would be a nag,
         and the slot is the less informed of the two */
      const yields = out.filter((q) => isSlot(q) && Math.abs(q.h - p.h) < PROMPT_MIN_GAP_MIN);
      if (!yields.length && out.length >= PROMPTS_MAX_PER_DAY) return;
      yields.forEach((q) => out.splice(out.indexOf(q), 1));
      out.push(p);
    });

    /* THE BUDGET, before the usual workout. Last, and under stricter
       rules than the after-prompts: it never displaces a slot — a
       question the person asked for is worth more than a sentence they
       did not — and it yields to anything already within the gap,
       because a budget delivered as the second banner in an hour is
       noise with numbers in it. */
    if (input.budget) {
      const wStart = typicalWorkoutStart(input.health, date);
      if (wStart != null) {
        const h = wStart - PROMPT_BEFORE_WORKOUT_MIN;
        const clear = h >= PROMPT_EARLIEST_MIN && h <= PROMPT_LATEST_MIN
          && out.length < PROMPTS_MAX_PER_DAY
          && !out.some((q) => Math.abs(q.h - h) < PROMPT_MIN_GAP_MIN);
        if (clear) out.push({ key: 'b', h, kind: 'budget', body: budgetNotification(input.budget) });
      }
    }
  }

  return out.sort((a, b) => a.h - b.h);
}

/**
 * Should today's prompt still fire? Not once its minute has passed
 * (iOS would fire it at once), and not when the person has already
 * checked in around then: for a slot, anywhere in its part of the day
 * — the rule the fixed reminders always had; for an after-something
 * prompt, within PROMPT_MIN_GAP_MIN either side of it.
 */
export function dueToday(p: Prompt, todayMinutes: number[], nowMinutes: number): boolean {
  if (p.h <= nowMinutes) return false;
  /* the budget asks nothing, so a check-in nearby answers nothing —
     it fires unless its minute has passed */
  if (p.kind === 'budget') return true;
  if (p.kind === 'm' || p.kind === 'd' || p.kind === 'e') {
    return !todayMinutes.some((h) => bandOf(h) === bandOf(p.h));
  }
  return !todayMinutes.some((h) => Math.abs(h - p.h) < PROMPT_MIN_GAP_MIN);
}
