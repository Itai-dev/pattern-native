/**
 * The reminder plan learned from Health — the learned times, the
 * bands they may not leave, the after-prompts, the gap and the cap,
 * the "already answered" rule, and the pain step's hint. Pure domain
 * against fixtures under a fixed-offset clock.
 *
 *   node tools/test-prompts.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const prompts = require(path.join(OUT, 'health', 'prompts.js'));
const ctx = require(path.join(OUT, 'health', 'context.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);

const HOUR = 3600000, MIN = 60000, OFFSET = 2 * HOUR;
const clock = {
  dateOf: (t) => new Date(t + OFFSET).toISOString().slice(0, 10),
  minutesOf: (t) => { const d = new Date(t + OFFSET); return d.getUTCHours() * 60 + d.getUTCMinutes(); },
  startOf: (date) => Date.parse(date + 'T00:00:00Z') - OFFSET,
};
const at = (date, minutes) => clock.startOf(date) + minutes * MIN;
const day = (n) => '2026-08-' + String(n).padStart(2, '0');
const prev = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

/** n nights ending on the n days before TODAY (i = 1 is yesterday):
 *  asleep from `bed` — the previous evening when after noon, the same
 *  morning when before — to `wake` */
const nights = (n, bed, wake) => {
  const h = {};
  for (let i = 1; i <= n; i++) {
    const d = day(20 - i);
    const b = bed(i);
    h[d] = { date: d, sleepMinutes: 420, sleepStart: at(b >= 720 ? prev(d) : d, b), sleepEnd: at(d, wake(i)), coverage: { sleep: true } };
  }
  return h;
};
const SLOTS = [
  { key: 'm', hour: 8, minute: 0, on: true },
  { key: 'd', hour: 13, minute: 0, on: false },
  { key: 'e', hour: 20, minute: 0, on: true },
];
const TODAY = day(20);

group('learned wake and bed times');
ok('the wake time is the MEDIAN of the last nights — one 4 a.m. night does not move it', (() => {
  const h = nights(10, () => 23 * 60, (i) => (i === 3 ? 4 * 60 : 7 * 60 + 10));
  return prompts.typicalWake(h, TODAY, clock) === 7 * 60 + 10;
})());
ok('under PROMPT_MIN_DAYS nights there is no learned time', (() => {
  const h = nights(th.PROMPT_MIN_DAYS - 1, () => 23 * 60, () => 7 * 60);
  return prompts.typicalWake(h, TODAY, clock) === null && prompts.typicalBedtime(h, TODAY, clock) === null;
})());
ok('bedtimes across midnight average as a clock, not as minutes since midnight', (() => {
  const h = nights(8, (i) => (i % 2 ? 23 * 60 + 40 : 20), () => 7 * 60);
  const b = prompts.typicalBedtime(h, TODAY, clock);
  return b === 0 || b === 23 * 60 + 40 || b === 20;
})());
ok('only nights BEFORE the date count, and only the last PROMPT_SLEEP_DAYS', (() => {
  const h = nights(19, () => 23 * 60, (i) => (i <= 5 ? 5 * 60 : 8 * 60));
  return prompts.typicalWake(h, TODAY, clock) === 8 * 60 && prompts.typicalWake(h, day(3), clock) === null;
})());

group('the slots, moved by Health but not out of their band');
ok('morning fires PROMPT_AFTER_WAKE_MIN after the usual wake, evening PROMPT_BEFORE_BED_MIN before the usual bedtime, both marked learned', (() => {
  const h = nights(10, () => 22 * 60 + 30, () => 6 * 60 + 40);
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true });
  const m = p.find((x) => x.key === 'm'), e = p.find((x) => x.key === 'e');
  return m.h === 6 * 60 + 40 + th.PROMPT_AFTER_WAKE_MIN && m.adapted === true
    && e.h === 22 * 60 + 30 - th.PROMPT_BEFORE_BED_MIN && e.adapted === true && p.length === 2;
})());
ok('a wake at 12:30 leaves the morning slot where the person set it — a morning stays a morning', (() => {
  const h = nights(10, () => 3 * 60, () => 12 * 60 + 30);
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true });
  const m = p.find((x) => x.key === 'm'), e = p.find((x) => x.key === 'e');
  return m.h === 8 * 60 && !m.adapted && e.h === 20 * 60 && !e.adapted;
})());
ok('adaptive off: the person’s own times, nothing learned, nothing added', (() => {
  const h = nights(10, () => 22 * 60, () => 6 * 60);
  h[day(13)].workouts = [{ uuid: 'a', h: 17 * 60, minutes: 40, activity: 'x' }];
  h[day(19)].workouts = [{ uuid: 'b', h: 17 * 60, minutes: 40, activity: 'x' }];
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: false });
  return p.length === 2 && p[0].h === 8 * 60 && p[1].h === 20 * 60 && !p.some((x) => x.adapted);
})());
ok('a slot that is off is not planned, with or without Health', (() => {
  const p = prompts.planDay(TODAY, { slots: SLOTS.map((s) => ({ ...s, on: false })), health: {}, clock, adaptive: true });
  return p.length === 0;
})());

group('after a workout: the weekday habit');
const weekly = (endMin, weeksBack) => {
  const h = {};
  weeksBack.forEach((w) => {
    const x = new Date(TODAY + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 7 * w);
    const d = x.toISOString().slice(0, 10);
    h[d] = { date: d, workouts: [{ uuid: d, h: endMin - 45, minutes: 45, activity: 'x' }], coverage: { workouts: true, movement: true } };
  });
  return h;
};
ok('two of the last four same weekdays with a workout earn a prompt PROMPT_AFTER_WORKOUT_MIN after the usual end', (() => {
  const h = weekly(18 * 60, [1, 3]);
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true });
  const w = p.find((x) => x.kind === 'workout');
  return prompts.typicalWorkoutEnd(h, TODAY) === 18 * 60 && w && w.h === 18 * 60 + th.PROMPT_AFTER_WORKOUT_MIN;
})());
ok('one workout on that weekday is not a habit; a workout on another weekday says nothing', (() => {
  const h = weekly(18 * 60, [1]);
  const x = new Date(TODAY + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - 8);
  const other = x.toISOString().slice(0, 10);
  h[other] = { date: other, workouts: [{ uuid: 'o', h: 17 * 60, minutes: 60, activity: 'x' }], coverage: { workouts: true } };
  return prompts.typicalWorkoutEnd(h, TODAY) === null;
})());
ok('the day’s LAST workout sets the end, and the median holds across weeks', (() => {
  const h = weekly(18 * 60, [1, 2, 3]);
  const k = Object.keys(h)[0];
  h[k].workouts.push({ uuid: 'late', h: 21 * 60, minutes: 30, activity: 'x' });
  return prompts.typicalWorkoutEnd(h, TODAY) === 18 * 60;
})());

group('before a workout: the budget, delivered');
/* a budget as budget.ts would return it — the planner reads only the
   two minutes, and the copy under test is the notification's */
const BUDGET = {
  usualMinutes: 35, pastMinutes: 48,
  association: { kind: 'workoutLoadVsNextMorning', verdict: 'possible', pairedDays: 18, delta: 2,
    low: { n: 6, factorMean: 25, painMean: 3 }, high: { n: 6, factorMean: 60, painMean: 5 } },
};
ok('the usual START is the median first workout on that weekday', (() => {
  const h = weekly(18 * 60, [1, 2, 3]);
  const k = Object.keys(h)[0];
  h[k].workouts.push({ uuid: 'early', h: 7 * 60, minutes: 30, activity: 'x' });
  return prompts.typicalWorkoutStart(h, TODAY) === 18 * 60 - 45
    && prompts.typicalWorkoutStart(weekly(18 * 60, [1]), TODAY) === null;
})());
ok('with a budget, a prompt lands PROMPT_BEFORE_WORKOUT_MIN before the usual start, carrying the numbers', (() => {
  const h = weekly(18 * 60, [1, 3]);
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true, budget: BUDGET });
  const b = p.find((x) => x.kind === 'budget');
  return b && b.h === 18 * 60 - 45 - th.PROMPT_BEFORE_WORKOUT_MIN
    && b.body === 'Your usual workout is about 35 minutes. Past 48, your next mornings ran harder. A description of your record, not a limit.'
    && !/stop|dial|should/i.test(b.body)
    && p.some((x) => x.kind === 'workout');
})());
ok('no budget, no prompt; adaptive off, no prompt; no habit on that weekday, no prompt', (() => {
  const h = weekly(18 * 60, [1, 3]);
  const none = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true, budget: null });
  const off = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: false, budget: BUDGET });
  const noHabit = prompts.planDay(TODAY, { slots: SLOTS, health: weekly(18 * 60, [1]), clock, adaptive: true, budget: BUDGET });
  return ![none, off, noHabit].some((p) => p.some((x) => x.kind === 'budget'));
})());
ok('the budget never displaces a slot and yields to anything within the gap', (() => {
  // usual start 17:15 → budget at 16:45; a midday slot at 16:00 is
  // within ninety minutes, so the budget stays out and the slot stays in
  const h = weekly(18 * 60, [1, 3]);
  const slots = SLOTS.map((s) => (s.key === 'd' ? { ...s, hour: 16, minute: 0, on: true } : s));
  const p = prompts.planDay(TODAY, { slots, health: h, clock, adaptive: true, budget: BUDGET });
  return p.some((x) => x.kind === 'd' && x.h === 16 * 60) && !p.some((x) => x.kind === 'budget');
})());
ok('the budget stays inside the waking window', (() => {
  // a 06:10 habit puts the budget at 05:40 — before PROMPT_EARLIEST_MIN
  const h = weekly(6 * 60 + 55, [1, 3]);
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true, budget: BUDGET });
  return prompts.typicalWorkoutStart(h, TODAY) === 6 * 60 + 10 && !p.some((x) => x.kind === 'budget');
})());
ok('a check-in nearby does not silence the budget; a passed minute does', (() => {
  const b = { key: 'b', h: 16 * 60 + 45, kind: 'budget', body: 'x' };
  return prompts.dueToday(b, [16 * 60 + 30], 12 * 60) === true
    && prompts.dueToday(b, [], 17 * 60) === false;
})());

group('after a dose: the habit in half-hours');
const doseDays = (n, times) => {
  const h = {};
  for (let i = 1; i <= n; i++) {
    const d = day(20 - i);
    h[d] = { date: d, doses: times(i).map((t) => ({ h: t, medId: 'ibu', med: 'Ibuprofen', status: 'taken' })), coverage: { medications: true } };
  }
  return h;
};
ok('doses logged around 8:00 on enough days become one habit, prompting PROMPT_AFTER_DOSE_MIN later', (() => {
  const h = doseDays(8, (i) => [8 * 60 + (i % 3) * 10]);
  const t = prompts.typicalDoseTimes(h, TODAY);
  const p = prompts.planDay(TODAY, { slots: SLOTS.map((s) => ({ ...s, on: false })), health: h, clock, adaptive: true });
  return t.length === 1 && Math.abs(t[0] - 8 * 60) <= 30 && p.length === 1 && p[0].kind === 'dose'
    && p[0].h === t[0] + th.PROMPT_AFTER_DOSE_MIN;
})());
ok('morning and evening doses are two habits; three doses one morning are one day, not three', (() => {
  const h = doseDays(7, (i) => (i === 1 ? [8 * 60, 8 * 60 + 5, 8 * 60 + 10, 20 * 60] : [8 * 60, 20 * 60]));
  const t = prompts.typicalDoseTimes(h, TODAY);
  return t.length === 2 && Math.abs(t[0] - 8 * 60) <= 30 && Math.abs(t[1] - 20 * 60) <= 30;
})());
ok('skipped doses and too few days make no habit', (() => {
  const h = doseDays(4, () => [8 * 60]);
  const s = doseDays(10, () => [8 * 60]);
  Object.keys(s).forEach((k) => { s[k].doses[0].status = 'skipped'; });
  return prompts.typicalDoseTimes(h, TODAY).length === 0 && prompts.typicalDoseTimes(s, TODAY).length === 0;
})());

group('the gap, the cap, the window');
ok('an after-prompt within PROMPT_MIN_GAP_MIN of a slot takes its place that day, never doubles it', (() => {
  const h = doseDays(8, () => [7 * 60 + 30]); // dose habit → prompt 8:30, morning slot at 8:00
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true });
  return p.length === 2 && p[0].kind === 'dose' && Math.abs(p[0].h - (8 * 60 + 30)) <= 15 && p[1].key === 'e';
})());
ok('two learned prompts keep the gap between themselves', (() => {
  const h = doseDays(8, () => [7 * 60]);            // dose habit ~7:15 → prompt ~8:15
  Object.assign(h, weekly(7 * 60 + 30, [1, 2]));    // workout ends 7:30 → prompt 8:15: the same quarter-hour
  const p = prompts.planDay(TODAY, { slots: SLOTS.map((s) => ({ ...s, on: false })), health: h, clock, adaptive: true });
  return p.length === 1;
})());
ok('never more than PROMPTS_MAX_PER_DAY, the slots that were not replaced first', (() => {
  const h = doseDays(8, () => [6 * 60, 10 * 60, 14 * 60, 17 * 60, 22 * 60]);
  const slots = SLOTS.map((s) => ({ ...s, on: true }));
  const p = prompts.planDay(TODAY, { slots, health: h, clock, adaptive: true });
  return p.length === th.PROMPTS_MAX_PER_DAY && ['d', 'e'].every((k) => p.some((x) => x.key === k));
})());
ok('an after-prompt outside the waking window is not scheduled', (() => {
  const h = doseDays(8, () => [23 * 60]); // habit at 23:00 → prompt 00:00
  const p = prompts.planDay(TODAY, { slots: SLOTS.map((s) => ({ ...s, on: false })), health: h, clock, adaptive: true });
  return p.length === 0;
})());
ok('the plan is in time order', (() => {
  const h = Object.assign(nights(10, () => 22 * 60, () => 6 * 60), doseDays(0, () => []));
  const p = prompts.planDay(TODAY, { slots: SLOTS, health: h, clock, adaptive: true });
  return p.every((x, i) => i === 0 || p[i - 1].h <= x.h);
})());

group('today: already answered, already past');
ok('a slot is skipped when a check-in sits in its part of the day; an after-prompt only within the gap', (() => {
  const m = { key: 'm', h: 8 * 60, kind: 'm' };
  const w = { key: 'w', h: 18 * 60 + 45, kind: 'workout' };
  return prompts.dueToday(m, [10 * 60], 7 * 60) === false
    && prompts.dueToday(m, [13 * 60], 7 * 60) === true
    && prompts.dueToday(w, [17 * 60 + 30], 12 * 60) === false
    && prompts.dueToday(w, [16 * 60], 12 * 60) === true;
})());
ok('a prompt whose minute has passed is not scheduled for a minute ago', (() => {
  return prompts.dueToday({ key: 'e', h: 20 * 60, kind: 'e' }, [], 20 * 60 + 1) === false;
})());

group('the calendar: what reads as exertion, and the prompt after it');
ok('titles classify by whole words, any case; most titles are neither', (() => {
  return prompts.calendarKind('Pilates') === 'exertion' && prompts.calendarKind('GYM 6pm') === 'exertion'
    && prompts.calendarKind('Physio - knee') === 'exertion' && prompts.calendarKind('Drive to Haifa') === 'exertion'
    && prompts.calendarKind('Dr Levy') === 'appointment' && prompts.calendarKind('Pain clinic follow-up') === 'appointment'
    && prompts.calendarKind('Lunch with Dana') === null && prompts.calendarKind('Runway review') === null;
})());
ok('an exertion in the calendar earns a prompt PROMPT_AFTER_WORKOUT_MIN after it ends; an appointment does not', (() => {
  const cal = [{ h: 17 * 60, minutes: 60, title: 'Yoga' }, { h: 10 * 60, minutes: 30, title: 'Dr Levy' }];
  const p = prompts.planDay(TODAY, { slots: SLOTS.map((s) => ({ ...s, on: false })), health: {}, clock, adaptive: true, calendar: cal });
  return p.length === 1 && p[0].kind === 'calendar' && p[0].h === 18 * 60 + th.PROMPT_AFTER_WORKOUT_MIN;
})());
ok('adaptive off keeps the calendar out of the plan too', (() => {
  const cal = [{ h: 17 * 60, minutes: 60, title: 'Yoga' }];
  return prompts.planDay(TODAY, { slots: SLOTS, health: {}, clock, adaptive: false, calendar: cal }).length === 2;
})());

group('the hint under the number');
ok('the last dose within the dose window and a workout that ended within three hours, as facts with "ago"', (() => {
  const d = { date: TODAY, doses: [
    { h: 8 * 60, medId: 'ibu', med: 'Ibuprofen', status: 'taken', qty: 400, unit: 'mg' },
    { h: 13 * 60 + 40, medId: 'ibu', med: 'Ibuprofen', status: 'taken', qty: 400, unit: 'mg' },
  ], workouts: [{ uuid: 'a', h: 12 * 60, minutes: 40, activity: 'x' }], coverage: { medications: true, workouts: true } };
  const lines = ctx.healthNowHint(d, 15 * 60);
  return lines.length === 2 && lines[0] === 'Apple Health: Ibuprofen 400 mg, 1h 20m ago'
    && lines[1] === 'Apple Health: 40 min workout, ended 2h 20m ago';
})());
ok('nothing recent, nothing said; a dose in the future (a later check-in) is not "ago"', (() => {
  const d = { date: TODAY, doses: [{ h: 16 * 60, medId: 'ibu', med: 'Ibuprofen', status: 'taken' }], coverage: { medications: true } };
  return ctx.healthNowHint(d, 15 * 60).length === 0 && ctx.healthNowHint(null, 900).length === 0
    && ctx.healthNowHint({ date: TODAY, doses: [{ h: 6 * 60, medId: 'x', med: 'X', status: 'taken' }], coverage: {} }, 15 * 60).length === 0;
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
