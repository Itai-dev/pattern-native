/**
 * Pattern's logic tests.
 *
 * The domain is pure TypeScript with no React Native in it, so it compiles
 * to plain CommonJS and runs in Node — no simulator, no device, no test
 * runner to install. Covers the 2026-08-20 build's acceptance list:
 * category mapping for every score, colour interpolation including 0 and
 * 10, no default selection, intentional 0, the starting point and the
 * seven-day weekly availability, activity names that would break grammar
 * if interpolated, event identity for editing and dedup, backup replace /
 * merge / invalid files, and the report with short, long and gapped data.
 *
 *   node tools/test-model.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const model = require(path.join(OUT, 'model.js'));
const scale = require(path.join(OUT, 'painScale.js'));
const report = require(path.join(OUT, 'report.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
};
const group = (n) => console.log('\n' + n);

/* ── 0–10 scale boundaries ─────────────────────────────────── */
group('scale boundaries');
ok('domain is 0..10', scale.PAIN_MIN === 0 && scale.PAIN_MAX === 10);
ok('below range clamps up', scale.normalizePain(-3) === 0);
ok('above range clamps down', scale.normalizePain(99) === 10);
ok('decimals round to integers', scale.normalizePain(4.6) === 5 && scale.normalizePain(4.4) === 4);
ok('non-numbers are rejected', scale.normalizePain('5') === null && scale.normalizePain(null) === null &&
  scale.normalizePain(undefined) === null && scale.normalizePain(NaN) === null);

/* ── category mapping: every score ─────────────────────────── */
group('category mapping');
const CATS = {
  0: 'No pain',
  1: 'Mild', 2: 'Mild', 3: 'Mild',
  4: 'Moderate', 5: 'Moderate', 6: 'Moderate',
  7: 'Severe', 8: 'Severe', 9: 'Severe',
  10: 'Most intense',
};
Object.keys(CATS).forEach((k) => {
  ok('score ' + k + ' is ' + CATS[k], scale.painLabel(+k) === CATS[k], scale.painLabel(+k));
});
ok('only the five category words exist', (() => {
  const seen = new Set();
  for (let i = 0; i <= 10; i++) seen.add(scale.painLabel(i));
  return seen.size === 5;
})());
ok('no legacy label survives', (() => {
  for (let i = 0; i <= 10; i++) {
    if (/Uncomfortable|Noticeable|Very mild|Strong|Extreme|imaginable/i.test(scale.painLabel(i))) return false;
  }
  return true;
})());
ok('averages take the nearest category', scale.painLabel(3.4) === 'Mild' && scale.painLabel(3.5) === 'Moderate');
ok('endpoints keep their short words',
  scale.PAIN_END_LOW === 'No pain' && scale.PAIN_END_HIGH === 'Most intense');

/* ── formatting ────────────────────────────────────────────── */
group('formatting');
ok('whole numbers print without a decimal', scale.formatScore(5) === '5');
ok('averages print one decimal', scale.formatScore(4.5) === '4.5');
ok('out-of-ten format has no spaces', scale.formatOutOf(5) === '5/10');
ok('score and label', scale.formatScoreAndLabel(4.5) === '4.5 · Moderate');
ok('check-in counts read naturally',
  scale.formatCheckins(0, true) === 'No check-ins yet today' &&
  scale.formatCheckins(1) === '1 check-in' &&
  scale.formatCheckins(2) === '2 check-ins');
ok('ability is a separate scale', scale.ABILITY_END_LOW === 'Not able at all' &&
  scale.ABILITY_END_HIGH === 'Fully able');

/* ── colour interpolation ──────────────────────────────────── */
group('colour interpolation');
ok('0 is the very dark blue-black anchor', scale.painColor(0).toUpperCase() === '#070C16', scale.painColor(0));
ok('10 is the icy near-white anchor', scale.painColor(10).toUpperCase() === '#EAF6FF', scale.painColor(10));
ok('10 is never pure white', scale.painColor(10).toUpperCase() !== '#FFFFFF');
ok('5 is Pattern blue', scale.painColor(5).toUpperCase() === '#0A84FF', scale.painColor(5));
ok('luminance rises monotonically 0→10', (() => {
  let prev = -1;
  for (let i = 0; i <= 10; i++) {
    const L = scale.luminanceOf(scale.painColor(i));
    if (L <= prev) return false;
    prev = L;
  }
  return true;
})(), Array.from({ length: 11 }, (_, i) => scale.luminanceOf(scale.painColor(i)).toFixed(3)));
ok('decimals get their own colour (smooth, not stepped)',
  scale.painColor(4.5) !== scale.painColor(4) && scale.painColor(4.5) !== scale.painColor(5));
ok('a decimal sits between its neighbours in luminance', (() => {
  const a = scale.luminanceOf(scale.painColor(4));
  const m = scale.luminanceOf(scale.painColor(4.5));
  const b = scale.luminanceOf(scale.painColor(5));
  return m > a && m < b;
})());
ok('out-of-range clamps to the anchors',
  scale.painColor(-2) === scale.painColor(0) && scale.painColor(14) === scale.painColor(10));
ok('the whole-step ramp has eleven colours', scale.painRamp().length === 11);

/* ── calendar readability: ink for every pain value ────────── */
group('ink and contrast');
ok('ink follows real luminance at every value', (() => {
  for (let i = 0; i <= 10; i++) {
    const expected = scale.luminanceOf(scale.painColor(i)) > 0.179 ? '#000000' : '#FFFFFF';
    if (scale.inkOn(i) !== expected) return false;
  }
  return true;
})());
ok('the dark low end takes light ink', scale.inkOn(0) === '#FFFFFF' && scale.inkOn(3) === '#FFFFFF');
ok('the luminous high end takes dark ink', scale.inkOn(10) === '#000000');
ok('both inks actually occur across the scale', (() => {
  const inks = new Set();
  for (let i = 0; i <= 10; i++) inks.add(scale.inkOn(i));
  return inks.size === 2;
})());

/* ── daily average ─────────────────────────────────────────── */
group('daily average');
const day = (logs, pain) => ({ pain: pain != null ? pain : Math.max.apply(null, logs.map((l) => l.pain)), cap: null, note: '', logs });
ok('no entry has no average', model.dailyAverage(null) === null);
ok('single check-in averages to itself', model.dailyAverage(day([{ h: 540, pain: 6 }])) === 6);
ok('two check-ins average', model.dailyAverage(day([{ h: 540, pain: 4 }, { h: 1200, pain: 5 }])) === 4.5);
ok('average is not the peak',
  model.dailyAverage(day([{ h: 1, pain: 2 }, { h: 2, pain: 8 }])) === 5);
ok('a zero day averages zero, not "missing"',
  model.dailyAverage(day([{ h: 1, pain: 0 }, { h: 2, pain: 0 }])) === 0);
ok('legacy day with no moments uses its stored value',
  model.dailyAverage({ pain: 7, cap: null, note: '' }) === 7);
ok('rounding is to one decimal',
  model.dailyAverage(day([{ h: 1, pain: 1 }, { h: 2, pain: 2 }, { h: 3, pain: 2 }])) === 1.7);
ok('count: none', model.checkinCount(null) === 0);
ok('count: three moments', model.checkinCount(day([{ h: 1, pain: 1 }, { h: 2, pain: 2 }, { h: 3, pain: 3 }])) === 3);
ok('count: legacy day counts as one', model.checkinCount({ pain: 5, cap: null, note: '' }) === 1);

/* ── no default selection, and 0 as a real choice ──────────── */
group('no default selection / intentional zero');
/* the screen holds `pain` as number|null and refuses to write while null;
   these assert the data-layer half — that nothing lands without a value,
   and that an intentional 0 is stored as a real answer */
ok('a day only exists once a moment is written',
  model.dailyAverage(undefined) === null && model.checkinCount(undefined) === 0);
ok('normalizePain(null) gives no value to write', scale.normalizePain(null) === null);
ok('an intentional 0 is stored, not treated as unset',
  model.applyMoment(null, 600, 0).logs[0].pain === 0 &&
  model.applyMoment(null, 600, 0).pain === 0);
ok('a 0 day averages 0 and labels "No pain"',
  model.dailyAverage(model.applyMoment(null, 600, 0)) === 0 &&
  scale.painLabel(0) === 'No pain');

/* ── migration of existing data ────────────────────────────── */
group('migration');
const clean = {
  '2026-08-01': day([{ h: 540, pain: 4 }, { h: 1200, pain: 8 }]),
  '2026-08-02': { pain: 3, cap: null, note: 'legacy' },
};
const m1 = model.migrateEntries(clean);
ok('a clean store needs no corrections', m1.corrected === 0, m1.corrected);
ok('clean values are preserved exactly',
  m1.entries['2026-08-01'].logs[1].pain === 8 && m1.entries['2026-08-02'].pain === 3);
ok('migration is idempotent',
  model.migrateEntries(m1.entries).corrected === 0);
const dirty = {
  '2026-08-03': { pain: 12, cap: null, note: '' },
  '2026-08-04': { pain: 4.6, cap: null, note: '', logs: [{ h: 1, pain: -2 }, { h: 2, pain: 7.4 }] },
  '2026-08-05': { pain: 'x', cap: null, note: '' },
};
const m2 = model.migrateEntries(dirty);
ok('out-of-range day value is clamped', m2.entries['2026-08-03'].pain === 10);
ok('out-of-range moment is clamped up', m2.entries['2026-08-04'].logs[0].pain === 0);
ok('decimal moment is rounded', m2.entries['2026-08-04'].logs[1].pain === 7);
ok('an unusable day is dropped, not guessed', m2.entries['2026-08-05'] === undefined);
ok('no existing day is deleted by a clean migration',
  Object.keys(model.migrateEntries(clean).entries).length === 2);

/* ── starting point and seven-day availability ─────────────── */
group('weekly availability');
ok('monday of a Wednesday', model.mondayOf('2026-08-19') === '2026-08-17');
ok('monday of a Monday is itself', model.mondayOf('2026-08-17') === '2026-08-17');
ok('no goal → nothing offered', model.funcStatus([], '2026-08-19', false).kind === 'noGoal');
ok('goal but no rating → baseline first', model.funcStatus([], '2026-08-19', true).kind === 'baseline');
const baselineWed = [{ week: '2026-08-17', ability: 4, savedOn: '2026-08-19' }];
ok('the day after the starting point is NOT due',
  model.funcStatus(baselineWed, '2026-08-20', true).kind === 'wait');
ok('two days after is still not due',
  model.funcStatus(baselineWed, '2026-08-21', true).kind === 'wait');
ok('six days after is still not due',
  model.funcStatus(baselineWed, '2026-08-25', true).kind === 'wait');
ok('the waiting card knows the exact date', (() => {
  const s = model.funcStatus(baselineWed, '2026-08-20', true);
  return s.kind === 'wait' && s.until === '2026-08-26';
})(), model.funcStatus(baselineWed, '2026-08-20', true));
ok('seven elapsed calendar days → due',
  model.funcStatus(baselineWed, '2026-08-26', true).kind === 'due');
ok('well past seven days → still due',
  model.funcStatus(baselineWed, '2026-09-10', true).kind === 'due');
ok('availability counts from the LAST rating', (() => {
  const two = [
    { week: '2026-08-10', ability: 3, savedOn: '2026-08-12' },
    { week: '2026-08-17', ability: 5, savedOn: '2026-08-19' },
  ];
  return model.funcStatus(two, '2026-08-25', true).kind === 'wait' &&
    model.funcStatus(two, '2026-08-26', true).kind === 'due';
})());
ok('old records without a saved date fall back to their week Monday', (() => {
  const legacy = [{ week: '2026-08-17', ability: 6 }];
  return model.funcNextDate(legacy) === '2026-08-24' &&
    model.funcStatus(legacy, '2026-08-23', true).kind === 'wait' &&
    model.funcStatus(legacy, '2026-08-24', true).kind === 'due';
})());
ok('funcDue mirrors the status', model.funcDue(baselineWed, '2026-08-26', true) === true &&
  model.funcDue(baselineWed, '2026-08-20', true) === false);
ok('no trend from one rating', model.funcTrend([{ week: '2026-08-17', ability: 6 }]) === null);
const tr = model.funcTrend([{ week: '2026-08-17', ability: 6 }, { week: '2026-08-10', ability: 3 }]);
ok('trend orders by week, not insertion', tr.first.ability === 3 && tr.last.ability === 6, tr);
ok('ability 0 is a real answer, not missing',
  model.latestFunc([{ week: '2026-08-17', ability: 0 }]).ability === 0);

/* ── activity names are never interpolated ─────────────────── */
group('activity-name grammar');
/* names like these produce "How able have you felt to running?" the moment
   they are dropped into a sentence — the questions must be fixed strings
   with the activity shown separately */
const AWKWARD = ['Running', 'to swim', 'playing with my kids', 'ריצה', 'the gym'];
ok('baseline question is a fixed string',
  model.FUNC_BASELINE_QUESTION === 'How able are you to do this activity today?');
ok('weekly question is a fixed string',
  model.FUNC_WEEKLY_QUESTION === 'How able were you to do this activity this week?');
ok('titles are fixed strings',
  model.FUNC_BASELINE_TITLE === 'Set your starting point' && model.FUNC_WEEKLY_TITLE === 'This week');
AWKWARD.forEach((name) => {
  ok('"' + name + '" never appears inside a question',
    model.FUNC_BASELINE_QUESTION.indexOf(name) < 0 && model.FUNC_WEEKLY_QUESTION.indexOf(name) < 0);
});
ok('the goal editor copy is the specified pair',
  model.GOAL_EDITOR_TITLE === 'Activity I want back' &&
  /rate your ability once a week/.test(model.GOAL_EDITOR_DESCRIPTION));

/* ── events: identity for editing and dedup ────────────────── */
group('events');
ok('seven event kinds', model.EVENT_KINDS.length === 7, model.EVENT_KINDS);
ok('the picker offers six of them — sleep is a daily factor now',
  model.EVENT_KINDS_OFFERED.length === 6 && model.EVENT_KINDS_OFFERED.indexOf('sleep') < 0,
  model.EVENT_KINDS_OFFERED);
ok('a stored sleep event still reads back, unrewritten',
  model.EVENT_KINDS.indexOf('sleep') >= 0
  && model.cleanEvent({ date: '2026-08-19', h: 600, kind: 'sleep', text: '' }) !== null);
ok('nothing in the labels claims a trigger',
  Object.values(model.EVENT_LABELS).every((v) => !/trigger|caus/i.test(v)), model.EVENT_LABELS);
const evA = { date: '2026-08-19', h: 600, kind: 'treatment', text: 'heat pack', helped: 7 };
const evB = { date: '2026-08-19', h: 600, kind: 'treatment', text: 'heat pack', helped: 7 };
const evC = { date: '2026-08-19', h: 601, kind: 'treatment', text: 'heat pack', helped: 7 };
ok('identical events share one identity', model.eventKey(evA) === model.eventKey(evB));
ok('a different minute is a different event', model.eventKey(evA) !== model.eventKey(evC));
ok('quality order does not change identity',
  model.eventKey({ date: '2026-08-19', h: 60, kind: 'flare', text: '', quality: ['aching', 'burning'] }) ===
  model.eventKey({ date: '2026-08-19', h: 60, kind: 'flare', text: '', quality: ['burning', 'aching'] }));
ok('cleanEvent accepts a valid event', model.cleanEvent(evA) !== null);
ok('cleanEvent refuses a bad date', model.cleanEvent({ ...evA, date: 'nope' }) === null);
ok('cleanEvent refuses an unknown kind', model.cleanEvent({ ...evA, kind: 'magic' }) === null);
ok('cleanEvent drops unknown quality ids',
  model.cleanEvent({ date: '2026-08-19', h: 60, kind: 'flare', text: '', quality: ['aching', 'NOPE'] })
    .quality.join() === 'aching');

/* ── duplicate protection ──────────────────────────────────── */
group('duplicate protection');
ok('an already-present event is not added again',
  model.dedupeEvents([evA], [evB]).length === 0);
ok('a genuinely new event survives dedup',
  model.dedupeEvents([evA], [evC]).length === 1);
ok('duplicates inside the incoming set collapse to one',
  model.dedupeEvents([], [evA, evB, evC]).length === 2);
ok('dedup with nothing existing keeps everything distinct',
  model.dedupeEvents([], [evA, evC]).length === 2);

/* ── backup validation, replace and merge ──────────────────── */
group('backups');
const v4 = JSON.stringify({
  app: 'pattern', version: 4, exported: '2026-08-20',
  entries: {
    '2026-08-10': { pain: 5, cap: 3, note: 'x', logs: [{ h: 600, pain: 5, loc: ['neck', 'NOPE'] }] },
    '2026-08-11': { pain: 99 },
    'not-a-date': { pain: 4 },
  },
  events: [evA, { date: 'bad', h: 1, kind: 'flare', text: '' }],
  func: [{ week: '2026-08-17', ability: 6, note: '', savedOn: '2026-08-19' }],
  goal: '  Running  ',
});
const vb = model.validateBackup(v4);
ok('a v4 backup validates', vb !== null);
ok('valid day restores', vb.entries['2026-08-10'].pain === 5);
ok('unknown location ids are dropped',
  JSON.stringify(vb.entries['2026-08-10'].logs[0].loc) === '["neck"]');
ok('out-of-range day is refused', vb.entries['2026-08-11'] === undefined);
ok('malformed key is refused', vb.entries['not-a-date'] === undefined);
ok('bad events are dropped, good ones kept', vb.events.length === 1);
ok('the rating date survives the round trip', vb.func[0].savedOn === '2026-08-19');
ok('the goal is trimmed', vb.goal === 'Running');
ok('a web v1 backup (entries only) still validates',
  model.validateBackup(JSON.stringify({ entries: { '2026-08-01': { pain: 3 } } })) !== null);
ok('a v2 weekly row becomes a function rating', (() => {
  const b = model.validateBackup(JSON.stringify({
    entries: {}, weekly: [{ week: '2026-08-03', goal: 4, note: 'w' }],
  }));
  return b && b.func.length === 1 && b.func[0].ability === 4 && b.func[0].savedOn === undefined;
})());
ok('corrupted JSON is refused, not thrown', model.validateBackup('{ nope') === null);
ok('an empty object is not a backup', model.validateBackup('{}') === null);
ok('unrelated JSON is not a backup', model.validateBackup('{"foo": 1}') === null);
ok('an empty entries backup validates to zero days',
  Object.keys(model.validateBackup(JSON.stringify({ entries: {} })).entries).length === 0);
ok('the export format version is 5', model.BACKUP_VERSION === 5);
ok('the scale version is 3', scale.SCALE_VERSION === 3);

/* ── the report data ───────────────────────────────────────── */
group('report data');
const mk = (n, gapAt) => {
  const entries = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 7, 20); d.setDate(d.getDate() - i);
    const k = model.iso(d);
    if (gapAt && gapAt.indexOf(i) >= 0) continue;   // leave holes
    entries[k] = day([{ h: 540, pain: i < n / 2 ? 3 : 7 }, { h: 1200, pain: i < n / 2 ? 5 : 9 }]);
    entries[k].logs[0].loc = ['lowerBack'];
  }
  return entries;
};
const base = {
  events: [
    { date: '2026-08-12', h: 600, kind: 'treatment', text: 'heat pack', helped: 7 },
    { date: '2026-08-13', h: 600, kind: 'sleep', text: '' },
  ],
  func: [
    { week: '2026-08-03', ability: 3, savedOn: '2026-08-05' },
    { week: '2026-08-17', ability: 6, savedOn: '2026-08-19' },
  ],
  goalText: 'walk 20 minutes',
  todayIso: '2026-08-20',
  windowDays: 90,
};

const twenty = report.buildReportData({ entries: mk(20), ...base });
ok('twenty days: not limited', twenty && twenty.limited === false);
ok('day and check-in counts', twenty.loggedDays === 20 && twenty.totalCheckins === 40);
ok('averages are daily averages, not peaks', twenty.avg === 6 && twenty.lowestDay === 4 && twenty.highestDay === 8, twenty);
ok('halves comparison present at 14+', twenty.halves !== null);
ok('locations ranked by days', twenty.locations[0].name === 'Lower back' && twenty.locations[0].days === 20);
ok('events are chronological',
  twenty.events.length === 2 && twenty.events[0].date <= twenty.events[1].date);
ok('ability change carried', twenty.abilityChange.first.ability === 3 && twenty.abilityChange.last.ability === 6);
ok('no unvalidated 7+ threshold anywhere in the data', JSON.stringify(twenty).indexOf('7 or above') < 0);

const two = report.buildReportData({ entries: mk(2), ...base });
ok('two days: limited', two.limited === true);
ok('two days: no halves comparison', two.halves === null);
ok('no data yields no report', report.buildReportData({ entries: {}, ...base }) === null);
ok('day count matches the window', report.reportDayCount(mk(20), '2026-08-20', 90) === 20);

/* ── the chart never bridges a gap ─────────────────────────── */
group('chart gaps');
const gapped = report.buildReportData({ entries: mk(10, [3, 4]), ...base });
const segs = report.chartSegments(gapped.days);
ok('a two-day hole splits the line', segs.length === 2, segs.map((s) => s.length));
ok('every logged day appears exactly once',
  segs.reduce((s, r) => s + r.length, 0) === gapped.days.length);
ok('segments stay in day order', (() => {
  for (const run of segs) {
    for (let i = 1; i < run.length; i++) if (run[i].date <= run[i - 1].date) return false;
  }
  return true;
})());
ok('an unbroken record is one segment',
  report.chartSegments(report.buildReportData({ entries: mk(10), ...base }).days).length === 1);

/* ── time of day ───────────────────────────────────────────── */
group('time of day');
ok('midnight is night', report.bandOf(0) === 'night');
ok('04:59 is still night', report.bandOf(4 * 60 + 59) === 'night');
ok('05:00 starts the morning', report.bandOf(5 * 60) === 'morning');
ok('11:59 is still morning', report.bandOf(11 * 60 + 59) === 'morning');
ok('12:00 starts the afternoon', report.bandOf(12 * 60) === 'afternoon');
ok('16:59 is still afternoon', report.bandOf(16 * 60 + 59) === 'afternoon');
ok('17:00 starts the evening', report.bandOf(17 * 60) === 'evening');
ok('21:59 is still evening', report.bandOf(21 * 60 + 59) === 'evening');
ok('22:00 starts the night', report.bandOf(22 * 60) === 'night');
ok('the last minute of the day is night', report.bandOf(1439) === 'night');
ok('every minute of the day lands in exactly one band', (() => {
  const KEYS = ['morning', 'afternoon', 'evening', 'night'];
  for (let h = 0; h <= 1439; h++) if (KEYS.indexOf(report.bandOf(h)) < 0) return false;
  return true;
})());

/* the twenty-day fixture logs at 09:00 and 20:40 every day */
ok('bands are aggregated from real check-in times',
  twenty.timeOfDay.length === 2, twenty.timeOfDay);
ok('bands come out in day order',
  twenty.timeOfDay[0].key === 'morning' && twenty.timeOfDay[1].key === 'evening');
ok('each band counts its own check-ins',
  twenty.timeOfDay[0].checkins === 20 && twenty.timeOfDay[1].checkins === 20);
ok('each band counts the days behind it',
  twenty.timeOfDay[0].days === 20 && twenty.timeOfDay[1].days === 20);
ok('band averages differ from the daily average when the times differ',
  twenty.timeOfDay[0].avg !== twenty.timeOfDay[1].avg, twenty.timeOfDay);
ok('the morning band averages its own check-ins only', (() => {
  const mornings = Object.values(mk(20)).map((e) => e.logs[0].pain);
  const want = Math.round((mornings.reduce((s, v) => s + v, 0) / mornings.length) * 10) / 10;
  return twenty.timeOfDay[0].avg === want;
})(), twenty.timeOfDay[0]);
ok('empty parts of the day are omitted, never shown as zero',
  twenty.timeOfDay.every((b) => b.checkins > 0) &&
  twenty.timeOfDay.every((b) => b.key !== 'afternoon' && b.key !== 'night'));
/* A band now has to clear BAND_MIN_CHECKINS across BAND_MIN_DAYS before
   it is shown at all, so these fixtures carry enough days to test WHERE a
   time lands rather than whether one reading is enough to draw a band.
   The gate itself is tested in tools/test-step1.js. */
const spread = (times, pain) => {
  const e = {}; const days = [];
  for (let i = 0; i < 4; i++) {
    const k = '2026-08-' + String(17 + i);
    e[k] = day(times.map((h) => ({ h, pain })));
    days.push({ date: k, avg: pain, count: times.length });
  }
  return [e, days];
};
ok('a night check-in lands in the night band', (() => {
  const [e, d] = spread([23 * 60 + 30, 23 * 60 + 40], 8);
  const b = report.timeOfDayBands(e, d);
  return b.length === 1 && b[0].key === 'night' && b[0].avg === 8;
})());
ok('an early-hours check-in lands in the night band, not the morning', (() => {
  const [e, d] = spread([3 * 60, 3 * 60 + 10], 6);
  return report.timeOfDayBands(e, d)[0].key === 'night';
})());
ok('legacy days with no timestamps contribute to no band', (() => {
  const e = { '2026-08-20': { pain: 7, cap: null, note: '' } };
  return report.timeOfDayBands(e, [{ date: '2026-08-20', avg: 7, count: 1 }]).length === 0;
})());
ok('many check-ins per day count as many check-ins across few days', (() => {
  const [e, d] = spread([6 * 60, 7 * 60, 8 * 60], 6);
  const b = report.timeOfDayBands(e, d);
  return b[0].checkins === 12 && b[0].days === 4 && b[0].avg === 6;
})());
ok('a limited record shows no time-of-day breakdown at all',
  two.timeOfDay.length === 0, two.timeOfDay);
ok('a gapped record still reports the bands it has',
  gapped.timeOfDay.length === 2 && gapped.timeOfDay[0].days === gapped.days.length);

/* ── the PDF document ──────────────────────────────────────── */
group('report HTML');
const html20 = report.reportHtml(twenty);
const html2 = report.reportHtml(two);
ok('white paper, dark text', /background:#FFFFFF/.test(html20) && /color:#1A1D21/.test(html20));
ok('header carries the required lines',
  html20.indexOf('Self-recorded pain and function summary') > 0 &&
  html20.indexOf('Exported 20 Aug 2026') > 0 &&
  html20.indexOf('20 logged days') > 0 &&
  html20.indexOf('40 check-ins') > 0 &&
  html20.indexOf('Pain scale: 0 = no pain, 10 = most intense') > 0);
ok('the specified intro replaces the old claim',
  html20.indexOf('Based on your self-recorded entries. This report does not provide a diagnosis or medical advice.') > 0 &&
  html20.indexOf('order clinicians assess') < 0);
ok('the specified footer is present',
  html20.indexOf('Self-recorded by the patient using Pattern. Events are shown alongside symptoms without implying causation.') > 0);
ok('no pseudo-clinical 7+ threshold', html20.indexOf('7 or above') < 0 && html20.indexOf('averaging 7') < 0);
ok('key metrics present', html20.indexOf('Average pain') > 0 &&
  html20.indexOf('Lowest daily average') > 0 && html20.indexOf('Logged days') > 0);
ok('activity and ability present',
  html20.indexOf('walk 20 minutes') > 0 && html20.indexOf('Latest weekly ability') > 0);
ok('ability is distinguished from pain',
  /Ability is a separate scale from pain/.test(html20));
ok('chart has labelled axes', /Daily average pain over time/.test(html20) &&
  html20.indexOf('>10</text>') > 0 && html20.indexOf('>0</text>') > 0);
ok('locations use readable labels', html20.indexOf('Lower back') > 0 &&
  html20.indexOf('Ranked by the number of days') > 0);
/* the label lost "or medication" when medication became its own kind —
   the old rows keep their kind, they just read as Treatment now */
ok('events show type, date, time and note',
  html20.indexOf('>Treatment<') > 0 && html20.indexOf('heat pack') > 0 &&
  html20.indexOf('10:00') > 0);
ok('treatment effect labelled as patient-reported', /patient-reported effect 7\/10/.test(html20));
ok('no causal claims', /No causal relationship with pain is implied/.test(html20) &&
  !/caus(ed|es) your/i.test(html20));
ok('sections avoid page breaks inside (multi-page safe)', /page-break-inside:avoid/.test(html20));
ok('time-of-day section present with its bands',
  html20.indexOf('Time of day') > 0 && html20.indexOf('05:00–11:59') > 0 &&
  html20.indexOf('17:00–21:59') > 0);
ok('each band prints its check-in count beside its average',
  /<th>Check-ins<\/th><th>Days<\/th>/.test(html20));
ok('the sampling caveat is stated, and no "worse in the mornings" claim',
  /not a claim about when pain is worst/.test(html20) &&
  !/worse in the (morning|evening)/i.test(html20));
ok('the section says how many timestamped check-ins it rests on',
  /Based on 40 timestamped check-ins/.test(html20));
ok('two days: no time-of-day section at all', html2.indexOf('Time of day') < 0);
ok('goal text is HTML-escaped', (() => {
  const sneaky = report.buildReportData({
    entries: mk(3), ...base, goalText: '<script>alert(1)</script>',
  });
  const h = report.reportHtml(sneaky);
  return h.indexOf('<script>alert') < 0 && h.indexOf('&lt;script&gt;') > 0;
})());

/* two logged days: the limited record */
ok('two days: labelled a limited record', /Limited record — 2 days logged/.test(html2));
ok('two days: carries the specified message',
  html2.indexOf('This short record shows what was logged. More days are needed before changes over time can be meaningfully reviewed.') > 0);
ok('two days: no trend or halves language',
  html2.indexOf('First half of the period') < 0 &&
  html2.indexOf('Change since first rating') < 0);
ok('two days: raw data still shown', /Pain recorded so far/.test(html2));

/* gaps in the PDF chart: one polyline per unbroken run */
const htmlGap = report.reportHtml(gapped);
ok('gapped chart draws separate lines, none across the hole',
  (htmlGap.match(/<polyline/g) || []).length === 2, (htmlGap.match(/<polyline/g) || []).length);
ok('every logged day gets a point', (htmlGap.match(/<circle/g) || []).length === gapped.days.length);

/* ── colour themes ─────────────────────────────────────────── */
group('colour themes');
const themeMod = require(path.join(OUT, 'theme.js'));
ok('four themes exist and blue is first/default', (() => {
  const ids = themeMod.PAIN_THEMES.map((x) => x.id);
  return ids.length === 4 && ids[0] === 'blue' && themeMod.DEFAULT_PAIN_THEME === 'blue';
})(), themeMod.PAIN_THEMES.map((x) => x.id));
ok('the default theme is blue', scale.getPainTheme() === 'blue');
ok('blue keeps the documented anchors', (() =>
  scale.painColor(0) === '#070C16' && scale.painColor(5) === '#0A84FF' && scale.painColor(10) === '#EAF6FF'
)(), [scale.painColor(0), scale.painColor(5), scale.painColor(10)]);
ok('every theme rises monotonically in luminance 0→10', (() => {
  for (const th of themeMod.PAIN_THEMES) {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const L = scale.luminanceOf(scale.painColor(i, th.id));
      if (L <= prev) return false;
      prev = L;
    }
  }
  return true;
})());
ok('no theme reaches pure white or pure black', (() =>
  themeMod.PAIN_THEMES.every((th) =>
    scale.painColor(10, th.id) !== '#FFFFFF' && scale.painColor(0, th.id) !== '#000000')
)());
ok('switching the theme changes the colour but not the words', (() => {
  const before = scale.painColor(5);
  const labelBefore = scale.painLabel(5);
  scale.setPainTheme('violet');
  const changed = scale.painColor(5) !== before && scale.painColor(5) === '#A455F0';
  const sameWords = scale.painLabel(5) === labelBefore && scale.formatOutOf(5) === '5/10';
  const brand = scale.themeBrand() === '#BF5AF2';
  scale.setPainTheme('blue');
  return changed && sameWords && brand;
})());
ok('an unknown theme id is ignored, never a crash', (() => {
  scale.setPainTheme('neon-argyle');
  return scale.getPainTheme() === 'blue' && scale.painColor(5) === '#0A84FF';
})());
ok('the animated ramp follows the active theme', (() => {
  scale.setPainTheme('mint');
  const r = scale.painRamp();
  const okRamp = r.length === 11 && r[5] === '#2AC0B0';
  scale.setPainTheme('blue');
  return okRamp && scale.painRamp()[5] === '#0A84FF';
})());
ok('ink stays legible on every theme at every value', (() => {
  for (const th of themeMod.PAIN_THEMES) {
    for (let i = 0; i <= 10; i++) {
      const bg = scale.painColor(i, th.id);
      const ink = scale.inkForBg(bg);
      const lum = scale.luminanceOf(bg);
      const inkLum = ink === '#000000' ? 0 : 1;
      const contrast = (Math.max(lum, inkLum) + 0.05) / (Math.min(lum, inkLum) + 0.05);
      if (contrast < 4.5) return false;
    }
  }
  return true;
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
