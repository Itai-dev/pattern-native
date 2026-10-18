/**
 * The return-to-activity model — recovery.ts. The goal's three states,
 * which sessions count toward it, the hero, and each guidance state.
 * Pure domain against fixtures; no mock data reaches the app.
 *
 *   node tools/test-recovery.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const rec = require(path.join(OUT, 'recovery.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''));
};
const group = (n) => console.log('\n' + n);

/* 2026-09-28 is a Monday */
const TODAY = '2026-09-28';
const d = (day) => '2026-09-' + String(day).padStart(2, '0');
const entry = (logs) => ({ pain: logs[0].pain, cap: null, note: '', logs });
const hday = (date, workouts) => ({ date, coverage: { workouts: true }, workouts });
const wk = (minutes, effort, activity) => {
  const w = { uuid: 'u' + Math.random(), h: 12 * 60, minutes, activity: activity || '37' };
  if (effort != null) w.effort = effort;
  return w;
};
function sess(E, H, day, w, am, nextAm) {
  const date = day.length ? day : d(day);
  const next = day.length ? null : d(day + 1);
  H[date] = hday(date, (H[date] ? H[date].workouts : []).concat([w]));
  if (!E[date]) E[date] = entry([{ h: 8 * 60, pain: am }]);
  if (next && nextAm != null) E[next] = entry([{ h: 8 * 60, pain: nextAm }]);
}
const RUN = { v: 1, activity: 'running', label: 'running', weeklySessions: 3, setOn: d(1) };

group('the goal');
ok('names come from the activity, or the person’s words for other', rec.goalLabel('running') === 'running'
  && rec.goalLabel('other', '  Climbing with my son ') === 'Climbing with my son'
  && rec.goalLabel('other', '') === 'my activity');
ok('sessions count toward the goal by Health’s names, with neighbours', (() => {
  const walk = { v: 1, activity: 'walking', label: 'walking', weeklySessions: null, setOn: d(1) };
  const other = { v: 1, activity: 'other', label: 'x', weeklySessions: null, setOn: d(1) };
  const skipped = { v: 1, activity: null, label: '', weeklySessions: null, setOn: d(1) };
  return rec.goalMatches(walk, 'hiking') && rec.goalMatches(walk, 'walking') && !rec.goalMatches(walk, 'running')
    && rec.goalMatches(other, 'rowing') && !rec.goalMatches(skipped, 'walking');
})());
ok('no hero without an answered goal: never asked, or skipped', (() => {
  const skipped = { v: 1, activity: null, label: '', weeklySessions: null, setOn: d(1) };
  return rec.recoveryHero(null, {}, {}, TODAY) === null && rec.recoveryHero(skipped, {}, {}, TODAY) === null;
})());

ok('an old free-text intention reads as a goal; a stored goal or skip wins', (() => {
  const run = rec.goalFromIntention('Get back to Running');
  const other = rec.goalFromIntention('  Cooking dinner  ');
  const skipped = { v: 1, activity: null, label: '', weeklySessions: null, setOn: d(1) };
  return run.activity === 'running' && run.label === 'running'
    && other.activity === 'other' && other.label === 'Cooking dinner'
    && rec.goalFromIntention('') === null && rec.goalFromIntention(null) === null
    && rec.currentGoal(null, 'walking the dog').activity === 'walking'
    && rec.currentGoal(skipped, 'walking the dog') === skipped
    && rec.currentGoal(RUN, 'swimming') === RUN;
})());

group('the hero');
ok('sessions this week count the goal’s sessions only, from Monday', (() => {
  const E = {}, H = {};
  sess(E, H, 27, wk(30), 4, 4);                  // Sunday: last week
  sess(E, H, TODAY, wk(30), 4);                  // running today
  sess(E, H, TODAY, wk(30, null, '46'), 4);      // a swim: not the goal
  const h = rec.recoveryHero(RUN, E, H, TODAY);
  return h.title === 'Back to running' && h.sessionsThisWeek === 1 && h.progressLine === '1 session this week · aiming for 3'
    && h.status.kind === 'learning';
})());
ok('no weekly target: a plain count', (() => {
  const g = { v: 1, activity: 'running', label: 'running', weeklySessions: null, setOn: d(1) };
  return rec.recoveryHero(g, {}, {}, TODAY).progressLine === '0 sessions this week';
})());
ok('status follows the level of the newest effort band', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(30, 2), 4, 4));
  const up = rec.recoveryHero(RUN, E, H, TODAY).status;
  sess(E, H, 16, wk(30, 2), 4, 7);
  const hold = rec.recoveryHero(RUN, E, H, TODAY).status;
  return up.kind === 'tolerating' && /went fine/.test(up.line)
    && hold.kind === 'hold' && /a harder next morning/.test(hold.line);
})());

group('today’s guidance');
ok('no sessions at all', rec.dailyGuidance(RUN, {}, {}, TODAY).state === 'noActivity');
ok('yesterday’s session and no check-in this morning: ask for it, with the button', (() => {
  const E = {}, H = {};
  sess(E, H, 27, wk(30), 4);
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'waiting' && g.checkIn === true && /this morning’s check-in/.test(g.headline);
})());
ok('today’s session: tomorrow will tell, no button', (() => {
  const E = {}, H = {};
  sess(E, H, TODAY, wk(30), 4);
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'waiting' && g.checkIn === false && /Tomorrow morning/.test(g.recommendation);
})());
ok('short of a baseline after a stable morning: learning, with how many more', (() => {
  const E = {}, H = {};
  sess(E, H, 20, wk(30), 4, 4);
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'learning' && g.sufficiency === 'early'
    && /went fine/.test(g.headline) && /^2 more sessions/.test(g.recommendation);
})());
ok('short of a baseline after a harder morning: lighter, no load named', (() => {
  const E = {}, H = {};
  sess(E, H, 20, wk(30), 4, 7);
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'lighter' && g.recommendedLoad === null && /rather than longer/.test(g.recommendation);
})());
ok('a level going up: repeat, with a load range at the effort', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(30, 5), 4, 4));
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'repeat' && g.sufficiency === 'enough'
    && g.recommendedLoad === '30–33 min at a moderate effort' && /A similar session/.test(g.recommendation);
})());
ok('a flare logged today: the same length, never longer, and the note says why', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(30, 5), 4, 4));
  const g = rec.dailyGuidance(RUN, E, H, TODAY, true);
  const plain = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'repeat' && g.recommendedLoad === '30 min at a moderate effort'
    && !/longer/.test(g.recommendation) && g.note === rec.FLARE_NOTE
    && plain.note === undefined && /–/.test(plain.recommendedLoad);
})());
ok('a flare never touches the hold or ease advice', (() => {
  const E = {}, H = {};
  sess(E, H, 8, wk(30, 8), 4, 4);
  sess(E, H, 10, wk(40, 8), 4, 7);
  sess(E, H, 12, wk(40, 8), 4, 7);
  const a = rec.dailyGuidance(RUN, E, H, TODAY, true), b = rec.dailyGuidance(RUN, E, H, TODAY);
  return JSON.stringify(a) === JSON.stringify(b);
})());
ok('two of three harder: lighter, an easier effort offered', (() => {
  const E = {}, H = {};
  sess(E, H, 8, wk(30, 8), 4, 4);
  sess(E, H, 10, wk(40, 8), 4, 7);
  sess(E, H, 12, wk(30, 8), 4, 4);
  sess(E, H, 14, wk(40, 8), 4, 7);
  const g = rec.dailyGuidance(RUN, E, H, TODAY);
  return g.state === 'lighter' && g.recommendedLoad === 'Around 27 min, at a moderate effort';
})());
ok('no goal: guidance reads every session', (() => {
  const E = {}, H = {};
  [10, 12, 14].forEach((day) => sess(E, H, day, wk(30, null, '46'), 4, 4));
  return rec.dailyGuidance(null, E, H, TODAY).state === 'repeat'
    && rec.dailyGuidance(RUN, E, H, TODAY).state === 'noActivity';
})());

group('the words');
ok('never "caused", "safe to train" or "push", and never a pain number', (() => {
  const E = {}, H = {};
  sess(E, H, 8, wk(30, 8), 9, 9);
  sess(E, H, 10, wk(40, 8), 8, 10);
  const texts = [];
  const g1 = rec.dailyGuidance(RUN, E, H, TODAY);
  texts.push(g1.headline, g1.recommendation, g1.recommendedLoad || '');
  [12, 14].forEach((day) => sess(E, H, day, wk(30, 8), 9, 9));
  const g2 = rec.dailyGuidance(RUN, E, H, TODAY);
  texts.push(g2.headline, g2.recommendation, g2.recommendedLoad || '', rec.recoveryHero(RUN, E, H, TODAY).status.line);
  const all = texts.join(' ');
  return !/caus|safe to|push/i.test(all) && !/\b(8|9|10)\b/.test(all);
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
