/* Date boundaries and honest comparison copy, using synthetic records. */
const assert = require('assert/strict');
const { addDays } = require('../.testbuild/model');
const { buildComparisons, associationSummary, leadingComparison } = require('../.testbuild/health/comparisons');
const { evaluate, associationCopy } = require('../.testbuild/health/engine');
const { todayInsight } = require('../.testbuild/todayInsight');
const { buildReportData } = require('../.testbuild/report');
const entries = {}, health = {};
for (let i = 0; i < 30; i++) {
  const date = addDays('2026-08-19', i), pain = i % 2 ? 2 : 8;
  entries[date] = { pain, cap: null, note: '', logs: [{ h: 480, pain }, { h: 570, pain: 1 }] };
  health[date] = { date, coverage: { sleep: true, medications: true }, sleepMinutes: i % 2 ? 480 : 300,
    doses: [{ h: 510, medId: 'example', med: 'Example', status: 'taken' }] };
}
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const cats = ['sleep', 'medications'];
const month = buildComparisons(entries, health, cats, '2026-08-19', '2026-09-17');
check('range changes rebuild health and medication evidence without borrowing earlier days', () => {
  assert.equal(month[0].status, 'Worth watching');
  const week = buildComparisons(entries, health, cats, '2026-09-11', '2026-09-17');
  assert.equal(week[0].status, 'Still collecting');
  assert.equal(week[0].health.pairedDays, 7);
  assert.equal(week.find(r => r.family === 'Medications').dose.pairs, 7);
  assert.ok(week.every(r => !r.from || r.from >= '2026-09-11'));
  const report = buildReportData({ entries, events: [], func: [], goalText: null, todayIso: '2026-09-17',
    windowDays: 7, healthDays: health, healthCategories: cats });
  assert.equal(report.health.association, null);
  assert.equal(report.health.doses.length, 0); // Seven pairs are still an early picture.
  assert.equal(report.health.medications[0].taken, 7);
});
check('secondary supported comparisons retain their own verdict and sentence', () => {
  assert.equal(month.filter(r => r.status === 'Worth watching').length, 2);
  const lead = leadingComparison(month);
  for (const row of month.filter(r => r.id !== lead.id)) {
    assert.equal(row.status, 'Worth watching');
    assert.doesNotMatch(row.summary, /no meaningful difference|similar before/i);
  }
  assert.deepEqual(associationSummary(month[0].health), {
    status: 'Worth watching', summary: associationCopy(month[0].health).body,
  });
});
check('large but unsupported differences do not become claims of similar pain', () => {
  const pairs = Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-08-19', i), factor: i % 2 ? 481 : 480, pain: i % 2 ? 1 : 8 }));
  const a = evaluate('sleepVsMorning', pairs);
  assert.equal(a.verdict, 'observation');
  assert.ok(Math.abs(a.delta) > 1);
  const row = associationSummary(a);
  assert.equal(row.status, 'No clear association');
  assert.match(row.summary, /consistent association/);
  assert.doesNotMatch(row.summary, /pain was similar|no meaningful difference/);
});
check('missing sleep differs from available sleep without a matching morning', () => {
  const noSleep = buildComparisons(entries, {}, ['sleep'], '2026-08-19', '2026-09-17')[0];
  const noMorning = buildComparisons({}, health, ['sleep'], '2026-08-19', '2026-09-17')[0];
  assert.match(noSleep.summary, /No sleep readings/);
  assert.match(noMorning.summary, /no morning check-ins match/);
  assert.equal(noSleep.health.pairedDays, 0);
});
check('both sides of a next-day comparison must fall inside the selected dates', () => {
  const e = { '2026-09-11': entries['2026-09-11'] };
  const h = { '2026-09-10': { date: '2026-09-10', steps: 5000, coverage: { movement: true } } };
  const kind = 'prevDayStepsVsMorning';
  assert.equal(buildComparisons(e, h, ['movement'], '2026-09-10', '2026-09-17').find(r => r.id === kind).health.pairedDays, 1);
  assert.equal(buildComparisons(e, h, ['movement'], '2026-09-11', '2026-09-17').find(r => r.id === kind).health.pairedDays, 0);
});
check('only enabled categories appear, including doses with no matching check-ins', () => {
  assert.deepEqual(buildComparisons(entries, health, [], '2026-08-19', '2026-09-17'), []);
  const rows = buildComparisons({}, health, ['medications'], '2026-08-19', '2026-09-17');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'dose:example');
  assert.equal(rows[0].status, 'Still collecting');
  assert.match(rows[0].evidence, /^0 doses/);
  assert.match(rows[0].summary, /prescribed routine/);
});
check('Today links identify the evidence that produced its sentence', () => {
  const input = { best: month[0].health, first: [], early: [], progress: [], doses: { best: null } };
  assert.equal(todayInsight(input).id, month[0].id);
  const med = month.find(r => r.family === 'Medications');
  assert.equal(todayInsight({ ...input, best: null, doses: { best: med.dose } }).id, med.id);
});
console.log(passed + ' comparison regression scenarios passed.');
