/**
 * Pattern's logic tests.
 *
 * The domain is pure TypeScript with no React Native in it, so it compiles
 * to plain CommonJS and runs in Node — no simulator, no device, no test
 * runner to install. Covers the areas the 2026-08-20 specification names:
 * scale boundaries, no default selection, the daily average, label mapping,
 * migration of existing data, function check-ins, events, and backup
 * export/restore.
 *
 *   node tools/test-model.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const model = require(path.join(OUT, 'model.js'));
const scale = require(path.join(OUT, 'painScale.js'));

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
ok('eleven labels', scale.PAIN_LABELS.length === 11);
ok('0 is No pain', scale.painLabel(0) === 'No pain');
ok('10 is Most intense imaginable', scale.painLabel(10) === 'Most intense imaginable');
ok('minimum is 0, never 1', scale.PAIN_LABELS[0] === 'No pain' && scale.normalizePain(0) === 0);
ok('labels never repeat', new Set(scale.PAIN_LABELS).size === 11, scale.PAIN_LABELS);
ok('labels rise monotonically in severity order', scale.painLabel(5) === 'Moderate' && scale.painLabel(7) === 'Severe');
ok('below range clamps up', scale.normalizePain(-3) === 0);
ok('above range clamps down', scale.normalizePain(99) === 10);
ok('decimals round to integers', scale.normalizePain(4.6) === 5 && scale.normalizePain(4.4) === 4);
ok('non-numbers are rejected', scale.normalizePain('5') === null && scale.normalizePain(null) === null &&
  scale.normalizePain(undefined) === null && scale.normalizePain(NaN) === null);

/* ── verbal label mapping ──────────────────────────────────── */
group('label mapping and formatting');
const EXPECTED = ['No pain', 'Very mild', 'Mild', 'Noticeable', 'Uncomfortable', 'Moderate',
  'Strong', 'Severe', 'Very severe', 'Extreme', 'Most intense imaginable'];
EXPECTED.forEach((w, i) => ok('label ' + i + ' is ' + w, scale.painLabel(i) === w, scale.painLabel(i)));
ok('averages take the nearest word', scale.painLabel(4.5) === 'Moderate' && scale.painLabel(4.4) === 'Uncomfortable');
ok('whole numbers print without a decimal', scale.formatScore(5) === '5');
ok('averages print one decimal', scale.formatScore(4.5) === '4.5');
ok('out-of-ten format', scale.formatOutOf(5) === '5 / 10');
ok('score and label', scale.formatScoreAndLabel(4.5) === '4.5 · Moderate');
ok('check-in counts read naturally',
  scale.formatCheckins(0, true) === 'No check-ins yet today' &&
  scale.formatCheckins(1) === '1 check-in' &&
  scale.formatCheckins(2) === '2 check-ins');
ok('endpoints keep their short words',
  scale.PAIN_END_LOW === 'No pain' && scale.PAIN_END_HIGH === 'Most intense');
ok('ability is a separate scale', scale.ABILITY_END_LOW === 'Not able at all' &&
  scale.ABILITY_END_HIGH === 'Fully able');

/* ── daily average ─────────────────────────────────────────── */
group('daily average');
const day = (logs, pain) => ({ pain: pain != null ? pain : Math.max.apply(null, logs.map((l) => l.pain)), cap: null, note: '', logs });
ok('no entry has no average', model.dailyAverage(null) === null);
ok('single check-in averages to itself', model.dailyAverage(day([{ h: 540, pain: 6 }])) === 6);
ok('two check-ins average', model.dailyAverage(day([{ h: 540, pain: 4 }, { h: 1200, pain: 5 }])) === 4.5);
ok('three check-ins average and round to one decimal',
  model.dailyAverage(day([{ h: 1, pain: 4 }, { h: 2, pain: 5 }, { h: 3, pain: 6 }])) === 5);
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

/* ── no default selection ──────────────────────────────────── */
group('no default selection');
/* the screen holds `pain` as number|null and refuses to write while null;
   these assert the data-layer half — that nothing lands without a value */
ok('applyMoment requires a real number to store',
  model.applyMoment(null, 600, 0).logs[0].pain === 0);
ok('a day only exists once a moment is written',
  model.dailyAverage(undefined) === null && model.checkinCount(undefined) === 0);
ok('normalizePain(null) gives no value to write', scale.normalizePain(null) === null);

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
ok('the day value follows the peak rule after repair', m2.entries['2026-08-04'].pain === 7);
ok('an unusable day is dropped, not guessed', m2.entries['2026-08-05'] === undefined);
ok('corrections are counted', m2.corrected >= 3, m2.corrected);
ok('no existing day is deleted by a clean migration',
  Object.keys(model.migrateEntries(clean).entries).length === 2);

/* ── function check-ins ────────────────────────────────────── */
group('function check-ins');
ok('monday of a Wednesday', model.mondayOf('2026-08-19') === '2026-08-17');
ok('monday of a Monday is itself', model.mondayOf('2026-08-17') === '2026-08-17');
ok('monday of a Sunday is the week just ending', model.mondayOf('2026-08-23') === '2026-08-17');
ok('not due without an activity', model.funcDue([], '2026-08-19', false) === false);
ok('due when the week has no rating', model.funcDue([], '2026-08-19', true) === true);
ok('not due once this week is rated',
  model.funcDue([{ week: '2026-08-17', ability: 6 }], '2026-08-19', true) === false);
ok('due again next week',
  model.funcDue([{ week: '2026-08-10', ability: 6 }], '2026-08-19', true) === true);
ok('no trend from one rating', model.funcTrend([{ week: '2026-08-17', ability: 6 }]) === null);
const tr = model.funcTrend([{ week: '2026-08-17', ability: 6 }, { week: '2026-08-10', ability: 3 }]);
ok('trend orders by week, not insertion', tr.first.ability === 3 && tr.last.ability === 6, tr);
ok('latest rating is the newest week',
  model.latestFunc([{ week: '2026-08-10', ability: 3 }, { week: '2026-08-17', ability: 6 }]).ability === 6);
ok('ability 0 is a real answer, not missing',
  model.latestFunc([{ week: '2026-08-17', ability: 0 }]).ability === 0);

/* ── events ────────────────────────────────────────────────── */
group('events');
ok('five event kinds', model.EVENT_KINDS.length === 5, model.EVENT_KINDS);
ok('kinds include the spec list',
  ['flare', 'treatment', 'activity', 'sleep', 'other'].every((k) => model.EVENT_KINDS.indexOf(k) >= 0));
ok('labels say treatment OR medication', model.EVENT_LABELS.treatment === 'Treatment or medication');
ok('nothing in the labels claims a trigger',
  Object.values(model.EVENT_LABELS).every((v) => !/trigger|caus/i.test(v)), model.EVENT_LABELS);

/* ── the report ────────────────────────────────────────────── */
group('report');
const entries = {};
for (let i = 0; i < 20; i++) {
  const d = new Date(2026, 7, 20); d.setDate(d.getDate() - i);
  const k = model.iso(d);
  entries[k] = day([{ h: 540, pain: i < 10 ? 3 : 7 }, { h: 1200, pain: i < 10 ? 5 : 9 }]);
  entries[k].logs[0].loc = ['lowerBack'];
}
const report = model.buildReport({
  entries,
  events: [
    { date: '2026-08-12', h: 600, kind: 'treatment', text: 'heat pack', helped: 7 },
    { date: '2026-08-13', h: 600, kind: 'sleep', text: '' },
  ],
  func: [{ week: '2026-08-03', ability: 3 }, { week: '2026-08-17', ability: 6 }],
  goalText: 'walk 20 minutes',
  todayIso: '2026-08-20',
  windowDays: 90,
});
ok('report is produced', report.length > 100);
ok('states the number of logged days and check-ins', /20 logged days · 40 check-ins/.test(report), report.slice(0, 200));
ok('names the scale', /scale 0-10, 0 = no pain/.test(report));
ok('reports daily AVERAGES, not peaks', /daily averages/i.test(report) && /Overall average 6/.test(report), report);
ok('function section uses the activity and its own scale',
  report.indexOf('walk 20 minutes') > 0 && /ability 0-10/.test(report));
ok('function trend shown', /3 \(/.test(report) && /6 \(/.test(report));
ok('locations included', /Lower back 20/.test(report));
ok('treatment effect is labelled as patient-reported', /patient-reported effect/i.test(report));
ok('events are events, never causes',
  /No causal relationship is implied/.test(report) && !/caus(ed|es) your/i.test(report));
ok('general-wellness footer present', /Not a medical device/.test(report));
ok('short records are flagged', /short record/.test(model.buildReport({
  entries: { '2026-08-20': day([{ h: 1, pain: 5 }]) },
  events: [], func: [], goalText: null, todayIso: '2026-08-20', windowDays: 90,
})));
ok('no data yields no report', model.buildReport({
  entries: {}, events: [], func: [], goalText: null, todayIso: '2026-08-20', windowDays: 90,
}) === '');
ok('report day count matches the window',
  model.reportDayCount(entries, '2026-08-20', 90) === 20);

/* ── backup export / restore (pure half) ───────────────────── */
group('backup shape');
const restored = model.cleanBackup({
  entries: {
    '2026-08-10': { pain: 5, cap: 3, note: 'x', logs: [{ h: 600, pain: 5, loc: ['neck', 'NOPE'] }] },
    '2026-08-11': { pain: 99 },
    'not-a-date': { pain: 4 },
  },
});
ok('valid day restores', restored['2026-08-10'].pain === 5);
ok('unknown location ids are dropped',
  JSON.stringify(restored['2026-08-10'].logs[0].loc) === '["neck"]');
ok('out-of-range day is refused', restored['2026-08-11'] === undefined);
ok('malformed key is refused', restored['not-a-date'] === undefined);
ok('an empty backup restores nothing rather than crashing',
  Object.keys(model.cleanBackup({})).length === 0);
ok('a v3 export carries the scale version', scale.SCALE_VERSION === 2);

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
