/**
 * What you can do — capacity.ts. Sessions and their outcomes, the level
 * and next step per activity, and the week's minutes that went fine.
 * Pure domain against fixtures.
 *
 *   node tools/test-capacity.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const cap = require(path.join(OUT, 'health', 'capacity.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);

/* 2026-09-28 is a Monday — the week starts on TODAY */
const TODAY = '2026-09-28';
const d = (day) => '2026-09-' + String(day).padStart(2, '0');
const entry = (logs) => ({ pain: logs[0].pain, cap: null, note: '', logs });
const hday = (date, workouts) => ({ date, coverage: { workouts: true }, workouts });
const walk = (h, minutes) => ({ uuid: 'w' + h + minutes, h, minutes, activity: '52' });

/** one walking session on `day` at noon for `min` minutes, with a
 *  morning check-in that day and the next — pain `am` then `nextAm` */
function morningPair(E, H, day, min, am, nextAm) {
  H[d(day)] = hday(d(day), [walk(12 * 60, min)]);
  E[d(day)] = entry([{ h: 8 * 60, pain: am }]);
  E[d(day + 1)] = entry([{ h: 8 * 60, pain: nextAm }]);
}

group('a session’s outcome');
ok('the check-in after, within the window, against the one before: fine', (() => {
  const E = { [d(20)]: entry([{ h: 11 * 60, pain: 4 }, { h: 13 * 60, pain: 5 }]) };
  const H = { [d(20)]: hday(d(20), [walk(12 * 60, 30)]) };
  const s = cap.sessions(E, H, TODAY);
  return s.length === 1 && s[0].outcome === 'fine' && s[0].activity === 'walking' && s[0].minutes === 30;
})());
ok('a rise of CAPACITY_HARDER_POINTS after the session is harder', (() => {
  const E = { [d(20)]: entry([{ h: 11 * 60, pain: 4 }, { h: 13 * 60, pain: 4 + th.CAPACITY_HARDER_POINTS }]) };
  const H = { [d(20)]: hday(d(20), [walk(12 * 60, 30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'harder';
})());
ok('the next morning against this morning answers on its own', (() => {
  const E = {}, H = {};
  morningPair(E, H, 20, 30, 4, 4 + th.CAPACITY_HARDER_POINTS);
  const harder = cap.sessions(E, H, TODAY)[0].outcome === 'harder';
  const E2 = {}, H2 = {};
  morningPair(E2, H2, 20, 30, 4, 5);
  return harder && cap.sessions(E2, H2, TODAY)[0].outcome === 'fine';
})());
ok('fine after the session but harder next morning is harder — either signal counts', (() => {
  const E = {
    [d(20)]: entry([{ h: 8 * 60, pain: 3 }, { h: 11 * 60, pain: 4 }, { h: 13 * 60, pain: 4 }]),
    [d(21)]: entry([{ h: 8 * 60, pain: 6 }]),
  };
  const H = { [d(20)]: hday(d(20), [walk(12 * 60, 30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'harder';
})());
ok('no check-ins around a session is unknown, never harder', (() => {
  const E = { [d(20)]: entry([{ h: 20 * 60, pain: 9 }]) };
  const H = { [d(20)]: hday(d(20), [walk(12 * 60, 30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'unknown';
})());
ok('a session whose next morning is still ahead is pending, even with a fine check-in after', (() => {
  const E = { [TODAY]: entry([{ h: 11 * 60, pain: 4 }, { h: 13 * 60, pain: 4 }]) };
  const H = { [TODAY]: hday(TODAY, [walk(12 * 60, 30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'pending';
})());
ok('a check-in DURING the session is neither side', (() => {
  const E = { [d(20)]: entry([{ h: 12 * 60 + 10, pain: 8 }]) };
  const H = { [d(20)]: hday(d(20), [walk(12 * 60, 30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'unknown';
})());
ok('sessions under CAPACITY_MIN_SESSION_MIN and future-dated days are not sessions', (() => {
  const H = {
    [d(20)]: hday(d(20), [walk(12 * 60, th.CAPACITY_MIN_SESSION_MIN - 1)]),
    '2026-09-30': hday('2026-09-30', [walk(12 * 60, 30)]),
  };
  return cap.sessions({}, H, TODAY).length === 0 && cap.capacityView({}, H, TODAY) === null;
})());

group('the level and the next step');
ok('short of CAPACITY_MIN_SESSIONS known sessions there is no level', (() => {
  const E = {}, H = {};
  morningPair(E, H, 10, 20, 4, 4);
  morningPair(E, H, 12, 20, 4, 4);
  H[d(14)] = hday(d(14), [walk(12 * 60, 20)]); // unknown: does not count
  const v = cap.capacityView(E, H, TODAY);
  return v.levels.length === 0 && v.collecting.length === 1
    && v.collecting[0].known === 2 && v.collecting[0].needed === th.CAPACITY_MIN_SESSIONS;
})());
ok('after sessions that went fine, the next step is up by ten per cent', (() => {
  const E = {}, H = {};
  morningPair(E, H, 10, 30, 4, 4);
  morningPair(E, H, 12, 30, 4, 4);
  morningPair(E, H, 14, 30, 4, 4);
  const l = cap.capacityView(E, H, TODAY).levels[0];
  return l.level === 30 && l.step === 'up' && l.next === 33 && l.fine === 3 && l.known === 3;
})());
ok('the step is at least one minute and at most five', (() => {
  const short = {}, SH = {}, long = {}, LH = {};
  [10, 12, 14].forEach((day) => { morningPair(short, SH, day, 6, 4, 4); morningPair(long, LH, day, 120, 4, 4); });
  return cap.capacityView(short, SH, TODAY).levels[0].next === 7
    && cap.capacityView(long, LH, TODAY).levels[0].next === 125;
})());
ok('the newest ran harder: hold at the level', (() => {
  const E = {}, H = {};
  morningPair(E, H, 10, 30, 4, 4);
  morningPair(E, H, 12, 30, 4, 4);
  morningPair(E, H, 14, 40, 4, 7);
  const l = cap.capacityView(E, H, TODAY).levels[0];
  return l.step === 'hold' && l.level === 30 && l.next === 30 && l.fine === 2;
})());
ok('two of the last three ran harder: ease back', (() => {
  const E = {}, H = {};
  morningPair(E, H, 8, 30, 4, 4);
  morningPair(E, H, 10, 40, 4, 7);
  morningPair(E, H, 12, 30, 4, 4);
  morningPair(E, H, 14, 40, 4, 7);
  const l = cap.capacityView(E, H, TODAY).levels[0];
  return l.step === 'ease' && l.level === 30 && l.next === 27;
})());
ok('the level reads only the most recent CAPACITY_RECENT known sessions', (() => {
  const E = {}, H = {};
  let day = 1;
  for (let i = 0; i < th.CAPACITY_RECENT; i++, day += 2) morningPair(E, H, day, 10, 4, 4);
  for (let i = 0; i < th.CAPACITY_RECENT; i++, day += 2) morningPair(E, H, day, 20, 4, 4);
  const l = cap.capacityView(E, H, '2026-10-05').levels[0];
  return l.level === 20 && l.known === th.CAPACITY_RECENT;
})());
ok('activities are kept apart, most recent first', (() => {
  const E = {}, H = {};
  [2, 4, 6].forEach((day) => {
    H[d(day)] = hday(d(day), [{ uuid: 's' + day, h: 12 * 60, minutes: 40, activity: '46' }]);
    E[d(day)] = entry([{ h: 8 * 60, pain: 4 }]);
    E[d(day + 1)] = entry([{ h: 8 * 60, pain: 4 }]);
  });
  [10, 12, 14].forEach((day) => morningPair(E, H, day, 20, 4, 4));
  const v = cap.capacityView(E, H, TODAY);
  return v.levels.length === 2 && v.levels[0].activity === 'walking' && v.levels[1].activity === 'swimming'
    && v.levels[1].level === 40;
})());

group('the week');
ok('this week counts minutes that went fine from Monday, and pending ones apart', (() => {
  const E = {}, H = {};
  morningPair(E, H, 27, 45, 4, 4);       // Sunday: last week
  H[TODAY] = hday(TODAY, [walk(12 * 60, 25)]);
  const v = cap.capacityView(E, H, TODAY);
  return v.weekFineMinutes === 0 && v.weekPendingMinutes === 25
    && /nothing with an answer yet/.test(cap.weekLine(v)) && /25 min waiting/.test(cap.weekLine(v));
})());
ok('a rest day changes nothing: the week only grows when a session is added', (() => {
  const E = {}, H = {};
  morningPair(E, H, 28, 30, 4, 4);
  const tue = cap.capacityView(E, H, '2026-09-30');
  const thu = cap.capacityView(E, H, '2026-10-02');
  return tue.weekFineMinutes === 30 && thu.weekFineMinutes === 30;
})());

group('the words');
ok('copy names minutes and counts, never a pain number, and says what it is not', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => morningPair(E, H, day, 30, 4, 4));
  const c = cap.levelCopy(cap.capacityView(E, H, TODAY).levels[0]);
  return c.title === 'Walking' && /3 of the last 3/.test(c.record) && /30 min/.test(c.record)
    && c.next === 'Next time, try 33 min.'
    && /not damage/.test(cap.CAPACITY_NOTE) && /not medical advice/.test(cap.CAPACITY_NOTE)
    && /never counted against you/.test(cap.CAPACITY_HOW);
})());
ok('hold and ease say why', (() => {
  const hold = cap.levelCopy({ activity: 'running', level: 20, next: 20, step: 'hold', known: 3, fine: 2, last: d(1) });
  const ease = cap.levelCopy({ activity: 'running', level: 20, next: 18, step: 'ease', known: 3, fine: 0, last: d(1) });
  return /ran harder, so stay at 20 min/.test(hold.next)
    && /Try 18 min next time/.test(ease.next) && /ran harder afterwards/.test(ease.record);
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
