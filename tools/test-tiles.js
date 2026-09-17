/**
 * The context tiles on the layered Today, cut from the day screen's own
 * sentences so the two can never disagree.
 *
 *   node tools/test-tiles.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const tiles = require(path.join(OUT, 'todayTiles.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
};

const day = {
  date: '2026-09-17', sleepMinutes: 400, sleepKind: 'asleep', steps: 8210,
  workouts: [{ minutes: 45 }],
};

ok('no day, no tiles — never a zero', tiles.contextTiles(null).length === 0
  && tiles.contextTiles(undefined).length === 0);

ok('a day with nothing measured has no tiles', tiles.contextTiles({ date: '2026-09-17' }).length === 0);

ok('sleep, steps and a workout become three tiles in that order', (() => {
  const t = tiles.contextTiles(day);
  return t.length === 3 && t.map((x) => x.key).join() === 'sleep,steps,workouts';
})(), tiles.contextTiles(day));

ok('the values are short and the labels plain', (() => {
  const [s, st, w] = tiles.contextTiles(day);
  return s.label === 'Slept' && s.value === '6h 40m'
    && st.label === 'Steps' && st.value === '8,210'
    && w.label === 'Workout' && w.value === '45 min';
})(), tiles.contextTiles(day));

ok('with no history there is no remark', tiles.contextTiles(day).every((t) => t.sub === ''));

ok('a remark against the usual appears only when the day screen would say it', (() => {
  /* twenty ordinary nights of 7h 40m, then a 6h 40m one: the day screen
     says "about 1h less than your usual", so the tile says it too */
  const all = (() => { const all = {}; for (let i = 20; i >= 1; i--) { const dt = new Date(Date.UTC(2026, 8, 17 - i)); const d = dt.toISOString().slice(0, 10); all[d] = { date: d, sleepMinutes: 460, steps: 8000 }; } all[day.date] = day; return all; })();
  const [s, st] = tiles.contextTiles(day, all);
  return /less than your usual/.test(s.sub) && s.value === '6h 40m'
    /* 8,210 against a usual of 8,000 is within the ratio the thresholds
       call the same, so no remark */
    && st.sub === '';
})(), tiles.contextTiles(day, (() => { const all = {}; for (let i = 20; i >= 1; i--) { const dt = new Date(Date.UTC(2026, 8, 17 - i)); const d = dt.toISOString().slice(0, 10); all[d] = { date: d, sleepMinutes: 460, steps: 8000 }; } all[day.date] = day; return all; })()));

ok('in-bed sleep still cuts to a value', (() => {
  const t = tiles.contextTiles({ date: '2026-09-17', sleepMinutes: 480, sleepKind: 'inBed' });
  return t.length === 1 && t[0].value === '8h';
})());

ok('two workouts read as a count and a total', (() => {
  const t = tiles.contextTiles({ date: '2026-09-17', workouts: [{ minutes: 30 }, { minutes: 60 }] });
  return t.length === 1 && t[0].label === 'Workouts' && t[0].value === '2 workouts · 1h 30m';
})(), tiles.contextTiles({ date: '2026-09-17', workouts: [{ minutes: 30 }, { minutes: 60 }] }));

ok('no tile ever carries a pain word or a verdict', (() => {
  const all = (() => { const all = {}; for (let i = 20; i >= 1; i--) { const dt = new Date(Date.UTC(2026, 8, 17 - i)); const d = dt.toISOString().slice(0, 10); all[d] = { date: d, sleepMinutes: 300, steps: 2000 }; } all[day.date] = day; return all; })();
  const text = tiles.contextTiles(day, all).map((t) => t.label + ' ' + t.value + ' ' + t.sub).join(' ').toLowerCase();
  return !/pain|better|worse|good|bad|%/.test(text);
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
