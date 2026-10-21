/**
 * The coach — coach.ts. The roadmap and achievements against fixtures,
 * and above all the rules AGENTS.md sets for them: earned by what was
 * done, never by a pain number; going past the plan earns nothing;
 * nothing resets; no medal flood on the first run.
 *
 *   node tools/test-coach.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const coach = require(path.join(OUT, 'coach.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : ''));
};
const group = (n) => console.log('\n' + n);

const TODAY = '2026-12-31';
/** day n counted from 1 Sep 2026 */
const day = (n) => {
  const d = new Date(2026, 8, 1);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const entry = (pain) => ({ pain, cap: null, note: '', logs: [{ h: 8 * 60, pain }] });
const RUN = '37';
const goal = (weekly) => ({ v: 1, activity: 'running', label: 'running', weeklySessions: weekly == null ? null : weekly, setOn: '' });

/** a record: sessions every other day, each [minutes, effort|null, nextMorningRise] */
function record(list, activity) {
  const E = {}, H = {};
  list.forEach(([minutes, effort, rise], i) => {
    const date = day(i * 2);
    const w = { uuid: 'u' + i, h: 12 * 60, minutes, activity: activity || RUN };
    if (effort != null) w.effort = effort;
    H[date] = { date, coverage: { workouts: true }, workouts: [w] };
    E[date] = entry(3);
    E[day(i * 2 + 1)] = entry(3 + (rise || 0));
  });
  return { E, H };
}
/** a record that does exactly what the plan says, n sessions, all fine */
function follow(start, effort, n) {
  const cap = require(path.join(OUT, 'health', 'capacity.js'));
  const list = [];
  for (let i = 0; i < n; i++) {
    const r = record(list);
    const all = cap.sessions(r.E, r.H, TODAY);
    const lvl = all.length ? cap.activityLevel(all[0].activity, all[0].band, all) : null;
    list.push([lvl ? lvl.next : start, effort]);
  }
  return record(list);
}
const find = (v, id) => v.achievements.filter((a) => a.id === id)[0];

group('no goal, no roadmap — and a skip is not a goal');
ok('never asked: no roadmap', coach.coachView({}, {}, null, TODAY).roadmap === null);
ok('skipped: no roadmap', coach.coachView({}, {}, { v: 1, activity: null, label: '', weeklySessions: null, setOn: '' }, TODAY).roadmap === null);
ok('pacing and totals still exist without a goal', !!find(coach.coachView({}, {}, null, TODAY), 'held'));

group('the plan each session was measured against is replayed');
(() => {
  /* three fine 20s, then the plan says 22 */
  const { E, H } = record([[20, 2], [20, 2], [20, 2], [22, 2], [30, 2]]);
  const ps = coach.plannedSessions(require(path.join(OUT, 'health', 'capacity.js')).sessions(E, H, TODAY));
  ok('no plan before enough sessions: on plan', ps[0].suggested === null && ps[0].onPlan);
  ok('suggestion after three fine', ps[3].suggested === 22 && ps[3].onPlan, ps[3]);
  ok('a session past the suggestion and its grace is not on plan', ps[4].onPlan === false, ps[4]);
})();

group('length milestones: earned at the plan’s pace, never by pushing');
(() => {
  /* jumps straight to 45 — far past every suggestion */
  const { E, H } = record([[15, 2], [15, 2], [15, 2], [45, 2], [45, 2], [45, 2]]);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('45 minutes when the plan said ~17 earns nothing', !find(v, 'len45').earnedOn && !find(v, 'len20').earnedOn, v.achievements.slice(0, 5));
})();
(() => {
  /* a steady build of fine sessions, +10% each time */
  const { E, H } = follow(18, 2, 40);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('first run back', find(v, 'first').earnedOn === day(0));
  ok('20, 30 and 45 arrive in order', find(v, 'len20').earnedOn && find(v, 'len30').earnedOn && find(v, 'len45').earnedOn
    && find(v, 'len20').earnedOn < find(v, 'len30').earnedOn && find(v, 'len30').earnedOn < find(v, 'len45').earnedOn, v.achievements.slice(0, 4));
  ok('roadmap: the length stages are done, steady is now', v.roadmap.stages.filter((s) => s.state === 'done').length === 3
    && v.roadmap.stages[3].state === 'now', v.roadmap.stages);
  ok('steady starts short: suggests ' + th.COACH_STEADY_START_MIN, v.roadmap.next && v.roadmap.next.minutes === th.COACH_STEADY_START_MIN, v.roadmap.next);
})();
(() => {
  /* no effort recorded at all still moves the roadmap */
  const { E, H } = follow(18, null, 12);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('unrated sessions count for the length stages', !!find(v, 'len20').earnedOn, v.achievements.slice(0, 3));
})();

group('pacing medals');
(() => {
  /* three fine, one harder (→ hold), a session at the held length */
  const { E, H } = record([[20, 2], [20, 2], [20, 2], [22, 2, 3], [22, 2]]);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('held the line: kept the length after a harder morning', find(v, 'held').earnedOn === day(8), find(v, 'held'));
})();
(() => {
  const { E, H } = record([[20, 2], [20, 2], [20, 2], [22, 2, 3], [40, 2]]);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('no hold medal for going long after a harder morning', !find(v, 'held').earnedOn);
})();
(() => {
  const { E, H } = record([[20, 2], [20, 2, 3], [20, 2, 3], [18, 2]]);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('eased back: the shorter session the plan suggested', find(v, 'eased').earnedOn === day(6), find(v, 'eased'));
})();

group('no medal reads a pain value');
(() => {
  /* the same sessions; only the check-in values differ, all "fine" */
  const a = record([[20, 2], [20, 2], [20, 2], [22, 2]]);
  const b = record([[20, 2], [20, 2], [20, 2], [22, 2]]);
  Object.keys(b.E).forEach((k) => { b.E[k] = entry(Math.min(10, b.E[k].pain + 5)); });
  const ids = (r) => coach.earnedIds(coach.coachView(r.E, r.H, goal(), TODAY)).join(',');
  ok('higher pain, same doing: the same medals', ids(a) === ids(b), [ids(a), ids(b)]);
})();

group('totals: cumulative, never in a row');
(() => {
  const list = []; for (let i = 0; i < 12; i++) list.push([20, 2]);
  const { E, H } = record(list);
  const v = coach.coachView(E, H, null, TODAY);
  ok('10 sessions earned on the tenth', find(v, 's10').earnedOn === day(18), find(v, 's10'));
  ok('the next total shows with its count', find(v, 's25') && find(v, 's25').sofar === '12 so far');
  ok('later totals stay out of sight', !find(v, 's50'));
  ok('active weeks count weeks, gaps or not', find(v, 'w4').earnedOn !== null);
})();

group('the first run after this shipped is not a flood');
(() => {
  const list = []; for (let i = 0; i < 12; i++) list.push([20, 2]);
  const { E, H } = record(list);
  const v = coach.coachView(E, H, goal(), TODAY);
  ok('no memory: nothing pops', coach.unseenAchievement(v, null) === null);
  ok('remembered: nothing new', coach.unseenAchievement(v, coach.earnedIds(v)) === null);
  const seen = coach.earnedIds(v).filter((id) => id !== 's10');
  ok('one new: that one', (coach.unseenAchievement(v, seen) || {}).id === 's10');
})();

group('the not-meaning sentences say the rules');
ok('achievements: never a pain number', /never by a pain number/.test(coach.COACH_NOTE));
ok('roadmap: not medical advice', /not medical advice/.test(coach.ROADMAP_NOTE));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
