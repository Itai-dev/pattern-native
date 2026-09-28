/**
 * What you can do — capacity.ts. Sessions and their next-morning
 * outcomes, effort bands, the level and step per activity and effort,
 * and the conclusions the card says. Pure domain against fixtures.
 *
 *   node tools/test-capacity.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const cap = require(path.join(OUT, 'health', 'capacity.js'));
const norm = require(path.join(OUT, 'health', 'normalize.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''));
};
const group = (n) => console.log('\n' + n);

/* 2026-09-28 is a Monday — the week starts on TODAY */
const TODAY = '2026-09-28';
const d = (day) => '2026-09-' + String(day).padStart(2, '0');
const entry = (logs) => ({ pain: logs[0].pain, cap: null, note: '', logs });
const hday = (date, workouts) => ({ date, coverage: { workouts: true }, workouts });
/** a workout: walking unless named, effort optional */
const wk = (minutes, effort, activity) => {
  const w = { uuid: 'u' + Math.random(), h: 12 * 60, minutes, activity: activity || '52' };
  if (effort != null) w.effort = effort;
  return w;
};

/** one session on `day` with a morning check-in that day and the next */
function sess(E, H, day, w, am, nextAm) {
  H[d(day)] = hday(d(day), (H[d(day)] ? H[d(day)].workouts : []).concat([w]));
  if (!E[d(day)]) E[d(day)] = entry([{ h: 8 * 60, pain: am }]);
  E[d(day + 1)] = entry([{ h: 8 * 60, pain: nextAm }]);
}

group('a session’s outcome is the next morning');
ok('next morning under the rise: fine; at the rise: harder', (() => {
  const E = {}, H = {}, E2 = {}, H2 = {};
  sess(E, H, 20, wk(30), 4, 4 + th.CAPACITY_HARDER_POINTS - 1);
  sess(E2, H2, 20, wk(30), 4, 4 + th.CAPACITY_HARDER_POINTS);
  return cap.sessions(E, H, TODAY)[0].outcome === 'fine' && cap.sessions(E2, H2, TODAY)[0].outcome === 'harder';
})());
ok('soreness right after the session does not count against it', (() => {
  const E = {
    [d(20)]: entry([{ h: 8 * 60, pain: 3 }, { h: 11 * 60, pain: 3 }, { h: 13 * 60, pain: 7 }]),
    [d(21)]: entry([{ h: 8 * 60, pain: 3 }]),
  };
  const H = { [d(20)]: hday(d(20), [wk(30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'fine';
})());
ok('no morning pair is unknown, never harder', (() => {
  const E = { [d(20)]: entry([{ h: 20 * 60, pain: 9 }]), [d(21)]: entry([{ h: 8 * 60, pain: 9 }]) };
  const H = { [d(20)]: hday(d(20), [wk(30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'unknown';
})());
ok('a session whose next morning is still ahead is pending', (() => {
  const E = { [TODAY]: entry([{ h: 8 * 60, pain: 4 }]) };
  const H = { [TODAY]: hday(TODAY, [wk(30)]) };
  return cap.sessions(E, H, TODAY)[0].outcome === 'pending';
})());
ok('short sessions and future-dated days are not sessions', (() => {
  const H = {
    [d(20)]: hday(d(20), [wk(th.CAPACITY_MIN_SESSION_MIN - 1)]),
    '2026-09-30': hday('2026-09-30', [wk(30)]),
  };
  return cap.sessions({}, H, TODAY).length === 0 && cap.capacityView({}, H, TODAY) === null;
})());

group('effort');
ok('Apple’s bands: 1–3 easy, 4–6 moderate, 7–10 hard, missing is null', cap.effortBand(1) === 'easy' && cap.effortBand(3) === 'easy'
  && cap.effortBand(4) === 'moderate' && cap.effortBand(6) === 'moderate'
  && cap.effortBand(7) === 'hard' && cap.effortBand(10) === 'hard' && cap.effortBand(undefined) === null);
ok('normalize keeps a real 1–10 effort and drops anything else', (() => {
  const clock = { minutesOf: () => 600 };
  const n = norm.normalizeWorkouts([
    { uuid: 'a', start: 0, end: 1800000, activity: '37', effort: 7.4, effortEstimated: true, source: 'w' },
    { uuid: 'b', start: 0, end: 1800000, activity: '37', effort: 0, source: 'w' },
    { uuid: 'c', start: 0, end: 1800000, activity: '37', source: 'w' },
  ], clock);
  return n[0].effort === 7 && n[0].effortEstimated === true
    && n[1].effort === undefined && n[2].effort === undefined && n[2].effortEstimated === undefined;
})());
ok('an easy run and a hard run are levelled apart', (() => {
  const E = {}, H = {};
  [2, 4, 6].forEach((day) => sess(E, H, day, wk(40, 2, '37'), 4, 4));
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(20, 8, '37'), 4, 4));
  const v = cap.capacityView(E, H, TODAY);
  return v.insights.length === 2
    && v.insights.some((i) => /^Easy running is going well so far\. Next time, go for 44 minutes\.$/.test(i.text))
    && v.insights.some((i) => /^Hard running is going well so far\. Next time, go for 22 minutes\.$/.test(i.text));
})());

group('the level and the next step');
ok('short of CAPACITY_MIN_SESSIONS known sessions: no conclusion, and what it waits for', (() => {
  const E = {}, H = {};
  sess(E, H, 10, wk(20, 2), 4, 4);
  sess(E, H, 12, wk(20, 2), 4, 4);
  const v = cap.capacityView(E, H, TODAY);
  return v.insights.length === 0
    && v.collecting === 'Pattern will have an answer about easy walking after one more session with a morning check-in that day and the next.';
})());
ok('up: ten per cent, at least one minute and at most five', (() => {
  const s = (min) => { const E = {}, H = {}; [10, 12, 14].forEach((day) => sess(E, H, day, wk(min), 4, 4)); return cap.capacityView(E, H, TODAY).insights[0].text; };
  return /go for 33 minutes/.test(s(30)) && /go for 7 minutes/.test(s(6)) && /go for 125 minutes/.test(s(120));
})());
ok('hold after one harder morning', (() => {
  const E = {}, H = {};
  sess(E, H, 10, wk(30, 5), 4, 4);
  sess(E, H, 12, wk(30, 5), 4, 4);
  sess(E, H, 14, wk(40, 5), 4, 7);
  const i = cap.capacityView(E, H, TODAY).insights[0];
  return i.text === 'Your last moderate walking session was followed by a harder morning. Stay at 30 minutes next time rather than going longer.';
})());
ok('ease after two of three, with the easier effort offered', (() => {
  const E = {}, H = {};
  sess(E, H, 8, wk(30, 8), 4, 4);
  sess(E, H, 10, wk(40, 8), 4, 7);
  sess(E, H, 12, wk(30, 8), 4, 4);
  sess(E, H, 14, wk(40, 8), 4, 7);
  const i = cap.capacityView(E, H, TODAY).insights[0];
  return /^Hard walking is costing you the next morning so far\. Try 27 minutes next time or keep it moderate/.test(i.text);
})());
ok('"so far" drops once the level rests on a full window', (() => {
  const E = {}, H = {};
  for (let i = 0, day = 1; i < th.CAPACITY_RECENT; i++, day += 2) sess(E, H, day, wk(20, 2), 4, 4);
  return cap.capacityView(E, H, TODAY).insights[0].text === 'Easy walking is going well. Next time, go for 22 minutes.';
})());

group('the conclusion that leads');
ok('within one activity, easy going well beside hard costing: one contrast, first', (() => {
  const E = {}, H = {};
  [1, 3, 5].forEach((day) => sess(E, H, day, wk(30, 2, '37'), 4, 4));
  [9, 11, 13].forEach((day) => sess(E, H, day, wk(25, 8, '37'), 4, 7));
  [15, 17, 19].forEach((day) => sess(E, H, day, wk(40, 2, '46'), 4, 4));
  const v = cap.capacityView(E, H, TODAY);
  return v.insights.length === 2 && v.insights[0].key === 'contrast.running'
    && /^Running goes well for you at an easy effort\. The hard sessions are the ones costing you the next morning — keep it easy, and build minutes there: next time, 33 minutes\.$/.test(v.insights[0].text)
    && /easy running/.test(v.insights[0].why) && /hard running/.test(v.insights[0].why)
    && /^Easy swimming/.test(v.insights[1].text);
})());
ok('warnings lead conclusions that are going well', (() => {
  const E = {}, H = {};
  [1, 3, 5].forEach((day) => sess(E, H, day, wk(30, 2), 4, 4));
  [9, 11, 13].forEach((day) => sess(E, H, day, wk(25, 8, '46'), 4, 7));
  const v = cap.capacityView(E, H, TODAY);
  return /^Hard swimming is costing/.test(v.insights[0].text) && /^Easy walking/.test(v.insights[1].text);
})());
ok('a session with no effort is read as its own group, and Why says so', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(30), 4, 4));
  const i = cap.capacityView(E, H, TODAY).insights[0];
  return /^Walking is going well/.test(i.text) && /had no effort/.test(i.why) && /3 of your last 3/.test(i.why);
})());

group('the week');
ok('pending minutes today, nothing earlier this week', (() => {
  const E = {}, H = {};
  sess(E, H, 27, wk(45, 2), 4, 4);       // Sunday: last week
  H[TODAY] = hday(TODAY, H[TODAY] ? H[TODAY].workouts.concat([wk(25, 2)]) : [wk(25, 2)]);
  return cap.capacityView(E, H, TODAY).headline
    === 'Tomorrow morning’s check-in will tell Pattern how today’s 25 minutes went.';
})());
ok('minutes that went fine, and the effort they mostly were', (() => {
  const E = {}, H = {};
  sess(E, H, 28, wk(60, 2), 4, 4);
  sess(E, H, 29, wk(20, 8, '37'), 4, 4);
  return cap.capacityView(E, H, '2026-10-01').headline === 'This week, your body handled 80 minutes of activity, mostly easy.';
})());
ok('a rest day changes nothing', (() => {
  const E = {}, H = {};
  sess(E, H, 28, wk(30, 2), 4, 4);
  return cap.capacityView(E, H, '2026-09-30').headline === cap.capacityView(E, H, '2026-10-02').headline;
})());

group('the words never carry a pain number');
ok('no conclusion, why or headline prints a pain value', (() => {
  const E = {}, H = {};
  [1, 3, 5].forEach((day) => sess(E, H, day, wk(30, 2, '37'), 9, 9));
  [9, 11, 13].forEach((day) => sess(E, H, day, wk(25, 8, '37'), 9, 10));
  const v = cap.capacityView(E, H, TODAY);
  const all = [v.headline].concat(v.insights.map((i) => i.text + ' ' + i.why)).join(' ');
  return !/\b(9|10)\b/.test(all) && /not damage/.test(cap.CAPACITY_NOTE) && /not medical advice/.test(cap.CAPACITY_NOTE);
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
