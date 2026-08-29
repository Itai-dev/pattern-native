/**
 * Apple Health tests — normalization, the pairing windows, the engine
 * gates, and the wording. Pure domain against fixtures; no store, no
 * simulator, no real clock.
 *
 * The clock is injected as a fixed offset so the suite behaves the same
 * on every machine — and one section injects a clock that jumps an hour
 * mid-range, because daylight saving is where day arithmetic goes to
 * lie.
 *
 *   node tools/test-health.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const normalize = require(path.join(OUT, 'health', 'normalize.js'));
const windows = require(path.join(OUT, 'health', 'windows.js'));
const engine = require(path.join(OUT, 'health', 'engine.js'));
const coverage = require(path.join(OUT, 'health', 'coverage.js'));
const noticed = require(path.join(OUT, 'health', 'noticed.js'));
const mock = require(path.join(OUT, 'health', 'mock.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);

/* ── a fixed-offset clock: "local" = UTC+2, no DST ─────────── */
const HOUR = 3600000, MIN = 60000;
const OFFSET = 2 * HOUR;
const clock = {
  dateOf: (t) => new Date(t + OFFSET).toISOString().slice(0, 10),
  minutesOf: (t) => {
    const d = new Date(t + OFFSET);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  },
  startOf: (date) => Date.parse(date + 'T00:00:00Z') - OFFSET,
};
/** epoch ms for local date + minutes, under the fixed clock */
const at = (date, minutes) => clock.startOf(date) + minutes * MIN;

/* ── raw-bundle helpers ─────────────────────────────────────── */
const bundle = (date, f) => Object.assign(mock.emptyBundle(date), f);
const qs = (start, end, value, source) => ({ start, end, value, source: source || 'phone' });

/* ═══ normalization ═══════════════════════════════════════════ */
group('sleep normalization');

const D = '2026-08-20';
ok('overlapping intervals from two sources merge to their union', (() => {
  // watch 23:00–06:30, phone 23:20–06:00 — the union is 23:00–06:30
  const n = normalize.nightSleep([
    { start: at('2026-08-19', 23 * 60), end: at(D, 6 * 60 + 30), stage: 'asleep', source: 'watch' },
    { start: at('2026-08-19', 23 * 60 + 20), end: at(D, 6 * 60), stage: 'asleep', source: 'phone' },
  ], D, clock);
  return n && n.minutes === 7 * 60 + 30;
})());
ok('in-bed and awake intervals are never counted as sleep', (() => {
  const n = normalize.nightSleep([
    { start: at('2026-08-19', 22 * 60), end: at(D, 8 * 60), stage: 'inBed', source: 'phone' },
    { start: at('2026-08-19', 23 * 60), end: at(D, 6 * 60), stage: 'asleep', source: 'phone' },
    { start: at(D, 3 * 60), end: at(D, 3 * 60 + 40), stage: 'awake', source: 'phone' },
  ], D, clock);
  // awake minutes are inside the asleep interval's union here — the
  // union of ASLEEP intervals alone is 23:00–06:00
  return n && n.minutes === 7 * 60;
})());
ok('a nap after noon is not the night before', (() => {
  const n = normalize.nightSleep([
    { start: at(D, 14 * 60), end: at(D, 15 * 60), stage: 'asleep', source: 'phone' },
  ], D, clock);
  return n === null;
})());
ok('no asleep samples → null, never zero', (() => {
  return normalize.nightSleep([], D, clock) === null;
})());

group('steps without double counting');
ok('phone and watch describing the same walk do not add', (() => {
  // watch saw 8000 across the day, phone saw 6000 — the day is 8000
  const day = normalize.normalizeDay(bundle(D, {
    steps: [
      qs(at(D, 9 * 60), at(D, 10 * 60), 5000, 'watch'),
      qs(at(D, 15 * 60), at(D, 16 * 60), 3000, 'watch'),
      qs(at(D, 9 * 60), at(D, 10 * 60), 4000, 'phone'),
      qs(at(D, 15 * 60), at(D, 16 * 60), 2000, 'phone'),
    ],
  }), clock);
  return day.steps === 8000;
})());
ok('hourly buckets come from the winning source only', (() => {
  const day = normalize.normalizeDay(bundle(D, {
    steps: [
      qs(at(D, 9 * 60), at(D, 9 * 60 + 30), 5000, 'watch'),
      qs(at(D, 9 * 60), at(D, 9 * 60 + 30), 4000, 'phone'),
    ],
  }), clock);
  return day.stepsHourly && day.stepsHourly[9] === 5000 && day.stepsHourly[10] === 0;
})());
ok('no step samples → steps stay missing and movement is uncovered', (() => {
  const day = normalize.normalizeDay(bundle(D, {}), clock);
  return day.steps === undefined && !day.coverage.movement && !day.coverage.workouts;
})());

group('workout deduplication');
ok('the same uuid arriving twice is one workout', (() => {
  const w = (uuid) => ({
    uuid, start: at(D, 18 * 60), end: at(D, 18 * 60 + 45), activity: 'run', source: 'watch',
  });
  const out = normalize.normalizeWorkouts([w('a'), w('a'), w('b')], clock);
  return out.length === 2;
})());
ok('two real 30-minute walks are two workouts', (() => {
  const out = normalize.normalizeWorkouts([
    { uuid: 'a', start: at(D, 8 * 60), end: at(D, 8 * 60 + 30), activity: 'walk', source: 'w' },
    { uuid: 'b', start: at(D, 18 * 60), end: at(D, 18 * 60 + 30), activity: 'walk', source: 'w' },
  ], clock);
  return out.length === 2 && out[0].h === 8 * 60 && out[1].minutes === 30;
})());
ok('"no workouts" is a value only on a movement-covered day', (() => {
  const covered = normalize.normalizeDay(bundle(D, {
    steps: [qs(at(D, 9 * 60), at(D, 10 * 60), 900, 'phone')],
  }), clock);
  const silent = normalize.normalizeDay(bundle(D, {}), clock);
  return covered.coverage.workouts && covered.workouts.length === 0
    && !silent.coverage.workouts && silent.workouts === undefined;
})());

group('daylight saving');
ok('a spring-forward night still files under its morning and loses its hour', (() => {
  // a clock whose offset jumps +1h at 2026-03-29T01:00Z (EU-style)
  const JUMP = Date.parse('2026-03-29T01:00:00Z');
  const dst = {
    dateOf: (t) => new Date(t + (t >= JUMP ? 3 * HOUR : 2 * HOUR)).toISOString().slice(0, 10),
    minutesOf: (t) => {
      const d = new Date(t + (t >= JUMP ? 3 * HOUR : 2 * HOUR));
      return d.getUTCHours() * 60 + d.getUTCMinutes();
    },
    // local midnight of 2026-03-29 is before the jump (offset +2)
    startOf: (date) => Date.parse(date + 'T00:00:00Z')
      - (Date.parse(date + 'T00:00:00Z') - 2 * HOUR >= JUMP ? 3 * HOUR : 2 * HOUR),
  };
  // asleep 23:00 local (28th) → 07:00 local (29th). Wall span is 8h,
  // but the night contained a skipped hour: real elapsed = 7h.
  const start = dst.startOf('2026-03-28') + 23 * 60 * MIN;
  const end = dst.startOf('2026-03-29') + 7 * 60 * MIN; // startOf handles offsets
  const n = normalize.nightSleep(
    [{ start, end, stage: 'asleep', source: 'w' }], '2026-03-29', dst);
  // elapsed minutes are computed from instants, so the answer is the
  // real duration, whatever the wall clock claimed
  return n && n.minutes === Math.round((end - start) / MIN);
})());

/* ═══ pairing windows ═════════════════════════════════════════ */
group('pairing: mornings look backward only');

const entriesWith = (obj) => obj;
const hday = (date, f) => Object.assign({ date, coverage: {} }, f);

const E1 = entriesWith({
  '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 8 * 60, pain: 6 }, { h: 20 * 60, pain: 4 }] },
});
ok('morning pain pairs with the previous night sleep', (() => {
  const H = { '2026-08-20': hday('2026-08-20', { sleepMinutes: 400, coverage: { sleep: true } }) };
  const p = windows.buildPairs('sleepVsMorning', E1, H);
  return p.length === 1 && p[0].factor === 400 && p[0].pain === 6;
})());
ok('morning pain never pairs with the same day steps', (() => {
  // steps exist for the 20th; the sleep pairing must not see them and
  // the prev-day pairing must look at the 19th, which is absent
  const H = { '2026-08-20': hday('2026-08-20', { steps: 9000, coverage: { movement: true } }) };
  const p = windows.buildPairs('prevDayStepsVsMorning', E1, H);
  return p.length === 0;
})());
ok('yesterday’s steps pair with this morning', (() => {
  const H = { '2026-08-19': hday('2026-08-19', { steps: 9000, coverage: { movement: true } }) };
  const p = windows.buildPairs('prevDayStepsVsMorning', E1, H);
  return p.length === 1 && p[0].factor === 9000 && p[0].pain === 6;
})());
ok('a day with no morning check-in produces no morning pair', (() => {
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 14 * 60, pain: 5 }] } };
  const H = { '2026-08-20': hday('2026-08-20', { sleepMinutes: 400, coverage: { sleep: true } }) };
  return windows.buildPairs('sleepVsMorning', E, H).length === 0;
})());

group('pairing: evenings and hours-before');
ok('evening pain pairs with steps up to the check-in hour only', (() => {
  const hourly = Array(24).fill(0);
  hourly[9] = 3000; hourly[14] = 2000; hourly[21] = 5000; // after the check-in
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 20 * 60 + 30, pain: 7 }] } };
  const H = { '2026-08-20': hday('2026-08-20', { steps: 10000, stepsHourly: hourly, coverage: { movement: true } }) };
  const p = windows.buildPairs('stepsBeforeVsEvening', E, H);
  return p.length === 1 && p[0].factor === 5000 && p[0].pain === 7;
})());
ok('with several evening check-ins, the LAST is the outcome — one pair per day', (() => {
  const hourly = Array(24).fill(0); hourly[10] = 1000;
  const E = {
    '2026-08-20': {
      pain: 5, cap: null, note: '',
      logs: [{ h: 17 * 60 + 10, pain: 3 }, { h: 19 * 60, pain: 5 }, { h: 21 * 60, pain: 8 }],
    },
  };
  const H = { '2026-08-20': hday('2026-08-20', { steps: 1000, stepsHourly: hourly, coverage: { movement: true } }) };
  const p = windows.buildPairs('stepsBeforeVsEvening', E, H);
  return p.length === 1 && p[0].pain === 8;
})());
ok('with several morning check-ins, the FIRST is the outcome', (() => {
  const E = {
    '2026-08-20': {
      pain: 5, cap: null, note: '',
      logs: [{ h: 6 * 60, pain: 7 }, { h: 9 * 60, pain: 3 }, { h: 11 * 60, pain: 2 }],
    },
  };
  const H = { '2026-08-20': hday('2026-08-20', { sleepMinutes: 300, coverage: { sleep: true } }) };
  const p = windows.buildPairs('sleepVsMorning', E, H);
  return p.length === 1 && p[0].pain === 7;
})());
ok('nine check-ins in one day are still one paired day', (() => {
  const logs = [];
  for (let i = 0; i < 9; i++) logs.push({ h: 6 * 60 + i * 30, pain: 5 });
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs } };
  const H = { '2026-08-20': hday('2026-08-20', { sleepMinutes: 300, coverage: { sleep: true } }) };
  return windows.buildPairs('sleepVsMorning', E, H).length === 1;
})());
ok('workout comparison needs COVERED days — silence is not "no workout"', (() => {
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 8 * 60, pain: 6 }] } };
  const uncovered = { '2026-08-19': hday('2026-08-19', {}) };
  const covered = { '2026-08-19': hday('2026-08-19', { workouts: [], coverage: { workouts: true, movement: true } }) };
  return windows.buildPairs('workoutVsNextMorning', E, uncovered).length === 0
    && windows.buildPairs('workoutVsNextMorning', E, covered).length === 1
    && windows.buildPairs('workoutVsNextMorning', E, covered)[0].factor === 0;
})());

/* ═══ the engine ══════════════════════════════════════════════ */
group('engine gates');

/** fabricate pairs: `n` days, factor low/high alternating, pain means split by `delta` */
function fabricate(n, lowF, highF, lowPain, highPain) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const high = i % 2 === 0;
    const date = '2026-07-' + String(i + 1).padStart(2, '0');
    out.push({ date, factor: high ? highF : lowF, pain: high ? highPain : lowPain });
  }
  return out;
}

ok('below HEALTH_MIN_PAIRED_DAYS the verdict is insufficient', (() => {
  const a = engine.evaluate('sleepVsMorning',
    fabricate(th.HEALTH_MIN_PAIRED_DAYS - 1, 300, 480, 7, 4));
  return a.verdict === 'insufficient';
})());
ok('a real spread and a real delta clear the gates', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 7, 4));
  return a.verdict === 'possible' && a.delta === -3 && a.low.n >= th.HEALTH_MIN_GROUP_DAYS;
})());
ok('a factor that barely varies is an observation, never a pattern', (() => {
  // 30 minutes between group means — under the 60-minute floor
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 450, 480, 7, 4));
  return a.verdict === 'observation';
})());
ok('a small pain delta is an observation, never a pattern', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 5.5, 5));
  return a.verdict === 'observation';
})());
ok('unbalanced workout groups fail the group floor', (() => {
  // 16 covered days, only 2 with workouts
  const pairs = [];
  for (let i = 0; i < 16; i++) {
    pairs.push({ date: '2026-07-' + String(i + 1).padStart(2, '0'), factor: i < 2 ? 1 : 0, pain: 5 });
  }
  const a = engine.evaluate('workoutVsNextMorning', pairs);
  return a.verdict === 'insufficient';
})());
ok('terciles discard the middle: extremes drive the comparison', (() => {
  // 18 pairs: 6 low (300min, pain 7), 6 middle (400min, pain 5.5), 6 high (480min, pain 4)
  const pairs = [];
  for (let i = 0; i < 6; i++) pairs.push({ date: 'a' + i, factor: 300, pain: 7 });
  for (let i = 0; i < 6; i++) pairs.push({ date: 'b' + i, factor: 400, pain: 5.5 });
  for (let i = 0; i < 6; i++) pairs.push({ date: 'c' + i, factor: 480, pain: 4 });
  const a = engine.evaluate('sleepVsMorning', pairs);
  return a.verdict === 'possible' && a.low.factorMean === 300 && a.high.factorMean === 480
    && a.delta === -3;
})());
ok('a previously shown association that stops holding fades, not vanishes', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 5.5, 5), true);
  return a.verdict === 'fading';
})());
ok('never shown and not holding → quiet observation, no fading theatre', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 5.5, 5), false);
  return a.verdict === 'observation';
})());

group('engine wording');
ok('copy exists only for possible', (() => {
  const obs = engine.evaluate('sleepVsMorning', fabricate(18, 450, 480, 7, 4));
  return engine.associationCopy(obs) === null;
})());
ok('the card carries sizes, timing, and the non-causation line', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 7, 4));
  const c = engine.associationCopy(a);
  return c && c.sample.indexOf(String(a.high.n)) >= 0
    && c.sample.indexOf(String(a.low.n)) >= 0
    && c.timing.indexOf('night before') >= 0
    && c.disclaimer === engine.HEALTH_NON_CAUSATION;
})());
ok('no sentence anywhere claims cause', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 7, 4));
  const c = engine.associationCopy(a);
  const all = (c.title + ' ' + c.body + ' ' + c.sample + ' ' + c.timing + ' '
    + c.disclaimer + ' ' + engine.fadedCopy(a) + ' '
    + engine.stillLearningCopy('Sleep')).toLowerCase();
  return ['caused', 'causes', 'because of', 'trigger', 'diagnos', 'predict',
    'medication', 'you should'].every((w) => all.indexOf(w) < 0)
    /* "not proof of what caused what" is the disclaimer DENYING cause —
       the only permitted appearance */
    || (all.split('cause').length === 2 && all.indexOf('not proof') >= 0);
})());

group('licensing: connected categories, and only those, are examined');
ok('nothing connected, nothing examined', (() => {
  return noticed.licensedKinds([]).length === 0;
})());
ok('connecting sleep licenses exactly the sleep pairing', (() => {
  const k = noticed.licensedKinds(['sleep']);
  return k.length === 1 && k[0] === 'sleepVsMorning';
})());
ok('workouts license the workout comparisons, movement the step and upright ones', (() => {
  const w = noticed.licensedKinds(['workouts']);
  const m = noticed.licensedKinds(['movement']);
  return w.length === 2 && w.indexOf('workoutLoadVsNextMorning') >= 0
    && m.length === 3 && m.indexOf('standBeforeVsEvening') >= 0
    && m.indexOf('sleepVsMorning') < 0;
})());
ok('heart and mind license nothing — imported, never examined', (() => {
  return noticed.licensedKinds(['heart', 'mind']).length === 0;
})());
ok('one card at most: the strongest possible wins', (() => {
  const a = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 7, 4));
  const b = engine.evaluate('prevDayStepsVsMorning', fabricate(18, 2000, 9000, 6, 4));
  const s = noticed.strongestPossible([a, b]);
  return s && s.kind === 'sleepVsMorning'; // |−3| beats |−2|
})());

group('coverage API');
ok('health covers sleep and movement factors, never stress', (() => {
  return coverage.healthCoverageFor('sleep.quality.v1') === 'sleep'
    && coverage.healthCoverageFor('movement.amount.v1') === 'movement'
    && coverage.healthCoverageFor('stress.level.v1') === null
    && coverage.healthCoverageFor('medication.change.v1') === null;
})());
ok('coverage counts covered days honestly', (() => {
  const E = { '2026-08-19': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] } };
  const H = { '2026-08-19': hday('2026-08-19', { sleepMinutes: 400, coverage: { sleep: true } }) };
  const c = coverage.factorCoverage(['sleep.quality.v1', 'stress.level.v1'], E, H, '2026-08-20', 7);
  return c[0].coveredDays === 1 && c[0].loggedDays === 1
    && c[1].category === null && c[1].coveredDays === 0;
})());

group('workout load: harder-than-usual vs lighter-than-usual');
ok('load pairs only on workout days, summing that day’s minutes', (() => {
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 8 * 60, pain: 6 }] } };
  const withTwo = {
    '2026-08-19': hday('2026-08-19', {
      workouts: [{ uuid: 'a', h: 540, minutes: 30, activity: 'run' },
        { uuid: 'b', h: 1080, minutes: 18, activity: 'walk' }],
      coverage: { workouts: true, movement: true },
    }),
  };
  const none = {
    '2026-08-19': hday('2026-08-19', { workouts: [], coverage: { workouts: true, movement: true } }),
  };
  const p = windows.buildPairs('workoutLoadVsNextMorning', E, withTwo);
  return p.length === 1 && p[0].factor === 48 && p[0].pain === 6
    && windows.buildPairs('workoutLoadVsNextMorning', E, none).length === 0;
})());
ok('a 20-minute spread floor gates the load claim', (() => {
  // groups 15 minutes apart in mean load — same behaviour sorted into piles
  const near = engine.evaluate('workoutLoadVsNextMorning', fabricate(18, 40, 55, 7, 4));
  const far = engine.evaluate('workoutLoadVsNextMorning', fabricate(18, 30, 75, 7, 4));
  return near.verdict === 'observation' && far.verdict === 'possible';
})());
ok('the load sentence says harder-workout days and names the outcome', (() => {
  const a = engine.evaluate('workoutLoadVsNextMorning', fabricate(18, 30, 75, 4, 7));
  const c = engine.associationCopy(a);
  return c && c.title === 'Workout load may be worth watching'
    && c.body.indexOf('harder-workout') >= 0
    && c.body.indexOf('morning pain') >= 0
    && c.timing.indexOf('your own usual') >= 0;
})());
ok('factor labels read as humans do', (() => {
  return engine.factorLabel('sleepVsMorning', 460) === '7h 40m'
    && engine.factorLabel('workoutLoadVsNextMorning', 48.4) === '48 min'
    && engine.factorLabel('prevDayStepsVsMorning', 4810) === '4,810 steps'
    && engine.factorLabel('workoutVsNextMorning', 1) === 'workout';
})());
ok('load is licensed by connecting workouts, not by sleep', (() => {
  const k = noticed.licensedKinds(['workouts']);
  const s = noticed.licensedKinds(['sleep']);
  return k.indexOf('workoutLoadVsNextMorning') >= 0
    && s.indexOf('workoutLoadVsNextMorning') < 0;
})());

group('the day’s context lines');
const context = require(path.join(OUT, 'health', 'context.js'));
ok('a full day reads in order, formatted for humans', (() => {
  const lines = context.healthDayLines(hday('2026-08-20', {
    sleepMinutes: 400, steps: 4810, distanceMeters: 3470, activeEnergyKcal: 412.6,
    workouts: [{ uuid: 'a', h: 540, minutes: 45, activity: '37' }],
    restingHeartRate: 61.4, hrvSDNN: 38.2,
  }));
  const t = lines.map((l) => l.text);
  return t[0] === '6h 40m asleep the night before'
    && t[1] === '4,810 steps'
    && t[2] === '3.5 km on foot'
    && t[3] === '413 kcal active energy'
    && t[4] === '45 min workout'
    && t[5] === 'Resting heart rate 61'
    && t[6] === 'HRV 38 ms';
})());
ok('missing categories are missing lines, never zeros', (() => {
  const lines = context.healthDayLines(hday('2026-08-20', { steps: 900 }));
  return lines.length === 1 && lines[0].key === 'steps'
    && context.healthDayLines(null).length === 0;
})());
ok('several workouts summarize as a count and a total', (() => {
  const lines = context.healthDayLines(hday('2026-08-20', {
    workouts: [
      { uuid: 'a', h: 540, minutes: 30, activity: 'run' },
      { uuid: 'b', h: 1000, minutes: 33, activity: 'walk' },
    ],
  }));
  return lines.length === 1 && lines[0].text === '2 workouts · 1h 3m total';
})());

group('upright time — standing measured, sitting never inferred');
ok('stand samples sum to a day total and hourly buckets', (() => {
  const day = normalize.normalizeDay(bundle(D, {
    stand: [qs(at(D, 9 * 60), at(D, 9 * 60 + 5), 4, 'watch'),
      qs(at(D, 14 * 60), at(D, 14 * 60 + 5), 6, 'watch')],
  }), clock);
  return day.standMinutes === 10 && day.standHourly[9] === 4 && day.standHourly[14] === 6
    && day.coverage.movement === true;
})());
ok('an evening pairs only with upright hours before the check-in', (() => {
  const hourly = Array(24).fill(0);
  hourly[9] = 30; hourly[14] = 20; hourly[21] = 40; // after the check-in
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 20 * 60 + 30, pain: 7 }] } };
  const H = { '2026-08-20': hday('2026-08-20', { standMinutes: 90, standHourly: hourly, coverage: { movement: true } }) };
  const p = windows.buildPairs('standBeforeVsEvening', E, H);
  return p.length === 1 && p[0].factor === 50 && p[0].pain === 7;
})());
ok('phone-only movement coverage does not fake a still day', (() => {
  // steps covered the day, but no watch: stand absent → no pair, not zero
  const E = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 20 * 60, pain: 7 }] } };
  const H = { '2026-08-20': hday('2026-08-20', { steps: 5000, stepsHourly: Array(24).fill(0), coverage: { movement: true } }) };
  return windows.buildPairs('standBeforeVsEvening', E, H).length === 0;
})());
ok('the upright claim needs an hour between the groups', (() => {
  const near = engine.evaluate('standBeforeVsEvening', fabricate(18, 200, 250, 4, 7));
  const far = engine.evaluate('standBeforeVsEvening', fabricate(18, 150, 280, 4, 7));
  return near.verdict === 'observation' && far.verdict === 'possible';
})());
ok('the upright sentence names evening pain and refuses to say sitting', (() => {
  const a = engine.evaluate('standBeforeVsEvening', fabricate(18, 150, 280, 7, 4));
  const c = engine.associationCopy(a);
  const claim = (c.title + ' ' + c.body).toLowerCase();
  return c.title === 'Time upright may be worth watching'
    && c.body.indexOf('evening pain') >= 0
    && claim.indexOf('sitting') < 0
    && c.timing.indexOf('not sitting') >= 0;
})());
ok('upright is licensed by movement, and its factor reads as hours', (() => {
  return noticed.licensedKinds(['movement']).indexOf('standBeforeVsEvening') >= 0
    && engine.factorLabel('standBeforeVsEvening', 250) === '4h 10m'
    && engine.factorLabel('standBeforeVsEvening', 50) === '50 min';
})());
ok('the day line says upright, with its own vs-usual floor', (() => {
  const prior = {};
  for (let i = 1; i <= 8; i++) {
    const d = '2026-08-0' + i;
    prior[d] = hday(d, { standMinutes: 240 });
  }
  const low = context.healthDayLines(hday('2026-08-15', { standMinutes: 150 }), prior);
  const near = context.healthDayLines(hday('2026-08-15', { standMinutes: 220 }), prior);
  return low[0].text === '2h 30m upright through the day — about 1h 30m less than your usual'
    && near[0].text === '3h 40m upright through the day';
})());

group('the day against your usual');
/** ten prior nights around 400 min and 7,000 steps */
const usualDays = {};
for (let i = 1; i <= 10; i++) {
  const d = '2026-08-' + String(i).padStart(2, '0');
  usualDays[d] = hday(d, { sleepMinutes: 400, steps: 7000, coverage: { sleep: true, movement: true } });
}
ok('a real deviation earns the comparison, exactly worded', (() => {
  const day = hday('2026-08-15', { sleepMinutes: 470, steps: 4810 });
  const t = context.healthDayLines(day, usualDays).map((l) => l.text);
  return t[0] === '7h 50m asleep the night before — about 1h 10m more than your usual'
    && t[1] === '4,810 steps — below your usual (about 7,000)';
})());
ok('a small deviation stays a plain fact — no words for rounding', (() => {
  const day = hday('2026-08-15', { sleepMinutes: 430, steps: 6200 });
  const t = context.healthDayLines(day, usualDays).map((l) => l.text);
  return t[0] === '7h 10m asleep the night before' && t[1] === '6,200 steps';
})());
ok('under a week of history there is no usual to compare against', (() => {
  const few = {};
  for (let i = 1; i <= 4; i++) {
    const d = '2026-08-0' + i;
    few[d] = hday(d, { sleepMinutes: 400 });
  }
  const day = hday('2026-08-15', { sleepMinutes: 480 });
  return context.healthDayLines(day, few)[0].text === '8h asleep the night before';
})());
ok('the day never joins its own baseline', (() => {
  // only the described day exists — no baseline, no comparison
  const only = { '2026-08-15': hday('2026-08-15', { sleepMinutes: 480 }) };
  return context.healthDayLines(only['2026-08-15'], only)[0].text
    === '8h asleep the night before';
})());
ok('no line, with or without a usual, ever mentions pain', (() => {
  const day = hday('2026-08-15', { sleepMinutes: 470, steps: 4810 });
  const all = context.healthDayLines(day, usualDays).map((l) => l.text).join(' ').toLowerCase();
  return all.indexOf('pain') < 0 && all.indexOf('better') < 0 && all.indexOf('worse') < 0;
})());

group('the day’s tiles');
ok('tiles carry the same numbers as the lines, shaped for the grid', (() => {
  const day = hday('2026-08-15', {
    sleepMinutes: 470, steps: 4810, standMinutes: 250, activeEnergyKcal: 412.6,
    workouts: [{ uuid: 'a', h: 540, minutes: 45, activity: '37' }],
    restingHeartRate: 61.4, hrvSDNN: 38.2,
    stateOfMind: [{ h: 600, valence: -0.4, kind: 'momentaryEmotion' },
      { h: 900, valence: 0.3, kind: 'momentaryEmotion' }],
  });
  const t = context.healthDayTiles(day, usualDays);
  const by = {};
  t.forEach((x) => { by[x.key] = x; });
  return by.sleep.value === '7h 50m' && by.sleep.sub === '1h 10m more than usual'
    && by.steps.sub === 'below your usual 7,000'
    && by.stand.value === '4h 10m'
    && by.workouts.value === '45 min'
    && by.heart.value === '61' && by.heart.sub === 'HRV 38 ms'
    && by.mind.value === 'Pleasant' && by.mind.sub === 'logged 2×';
})());
ok('the valence bands are fixed and read as plain words', (() => {
  return context.valenceWord(-0.8) === 'Very unpleasant'
    && context.valenceWord(-0.3) === 'Unpleasant'
    && context.valenceWord(0) === 'Neutral'
    && context.valenceWord(0.3) === 'Pleasant'
    && context.valenceWord(0.9) === 'Very pleasant';
})());

group('health context in the clinician report');
const reportMod = require(path.join(OUT, 'report.js'));

const repEntries = {};
for (let i = 1; i <= 14; i++) {
  const d = '2026-08-' + String(i).padStart(2, '0');
  repEntries[d] = { pain: 5, cap: null, note: '', logs: [{ h: 8 * 60, pain: 5 }] };
}
const repHealth = {};
for (let i = 1; i <= 9; i++) {
  const d = '2026-08-' + String(i).padStart(2, '0');
  repHealth[d] = { date: d, sleepMinutes: 400, coverage: { sleep: true } };
}
const repInput = (extra) => Object.assign({
  entries: repEntries, events: [], func: [], goalText: null,
  todayIso: '2026-08-14', windowDays: 30,
}, extra);

ok('no Health connection, no Health section — absent, not empty', (() => {
  const d = reportMod.buildReportData(repInput({}));
  return d && d.health === null
    && reportMod.reportHtml(d).indexOf('Context from Apple Health') < 0;
})());
ok('coverage counts logged days that also carried sensor data', (() => {
  const d = reportMod.buildReportData(repInput({ healthDays: repHealth }));
  return d && d.health && d.health.coverage.length === 1
    && d.health.coverage[0].name === 'Sleep'
    && d.health.coverage[0].covered === 9
    && reportMod.reportHtml(d).indexOf('9 of 14 logged days') >= 0;
})());
ok('nothing cleared the gates → the report says so, claims nothing', (() => {
  const d = reportMod.buildReportData(repInput({ healthDays: repHealth }));
  const html = reportMod.reportHtml(d);
  return html.indexOf('has met Pattern’s reporting bar') >= 0
    && html.indexOf('worth watching') < 0;
})());
ok('a gated association arrives with sizes, timing and the refusal of cause', (() => {
  const assoc = engine.evaluate('sleepVsMorning', fabricate(18, 300, 480, 7, 4));
  const d = reportMod.buildReportData(repInput({
    healthDays: repHealth, healthAssociation: assoc,
  }));
  const html = reportMod.reportHtml(d);
  return html.indexOf('Sleep may be worth watching') >= 0
    && html.indexOf('longer-sleep') >= 0
    && html.indexOf('night before') >= 0
    && html.indexOf('not proof of what caused what') >= 0;
})());

group('the mock service');
(async () => {
  const u = new mock.UnavailableHealthService();
  const empty = await u.fetchDay('2026-08-20');
  let rejected = false;
  await u.requestAuthorization().catch(() => { rejected = true; });
  ok('unavailable service returns empty days and rejects authorization',
    u.available() === false && empty.sleep.length === 0
    && empty.steps.length === 0 && rejected);

  const m = new mock.MockHealthService({
    '2026-08-20': {
      steps: [qs(1, 2, 100, 'p')],
      sleep: [{ start: 1, end: 2, stage: 'asleep', source: 'p' }],
    },
  });
  const asked = await m.fetchDay('2026-08-20', ['movement']);
  ok('the mock only returns categories that were asked for',
    asked.steps.length === 1 && asked.sleep.length === 0);

  console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
  process.exit(fail ? 1 : 0);
})();
