/**
 * The experiment — pairs from the record, the ending rules, the three
 * verdicts, and the words. Pure domain against fixtures.
 *
 *   node tools/test-experiment.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const x = require(path.join(OUT, 'experiment.js'));
const metrics = require(path.join(OUT, 'metrics.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);

const day = (n) => '2026-08-' + String(n).padStart(2, '0');
const M = x.EXPERIMENT_METRIC_ID;
/** an entry with a morning check-in at 08:00 and, optionally, the
 *  evening answer to the experiment */
function entry(pain, did) {
  const e = { pain, cap: null, note: '', logs: [{ h: 8 * 60, pain }] };
  if (did !== undefined) {
    e.ctx = { v: 1, a: {} };
    e.ctx.a[M] = did === 'skip'
      ? { value: '', h: 19 * 60, ts: 0, tz: 0, qv: 1, pid: null, skipped: 1 }
      : { value: did ? 'yes' : 'no', h: 19 * 60, ts: 0, tz: 0, qv: 1, pid: null };
  }
  return e;
}
const EXP = { id: 1, what: 'an early night', from: day(1), status: 'running' };

group('the metric');
ok('the evening question is in the registry, ordinal yes/no, asked from five', (() => {
  const m = metrics.getMetric(M);
  return m && m.type === 'ordinal' && m.eligibility === 'firstAfter1700'
    && metrics.validAnswerValue(M, 'yes') && metrics.validAnswerValue(M, 'no')
    && !metrics.validAnswerValue(M, 'maybe') && !m.protocolEligible;
})());

group('pairs: an evening answer and the next morning');
ok('a yes with a morning after pairs; a skip does not; no morning, no pair', (() => {
  const E = {};
  E[day(1)] = entry(5, true); E[day(2)] = entry(3, false); E[day(3)] = entry(6, 'skip');
  E[day(4)] = entry(4, true); /* day 5 has no check-in at all */
  E[day(6)] = entry(2, false); E[day(7)] = { pain: 4, cap: null, note: '', logs: [{ h: 15 * 60, pain: 4 }] };
  const p = x.experimentPairs(EXP, E, day(8));
  // day1 yes→day2 morning 3; day2 no→day3 morning 6; day3 skipped; day4 yes→day5 none;
  // day6 no→day7 has only an afternoon check-in → no morning
  return p.length === 2 && p[0].did === true && p[0].pain === 3
    && p[1].did === false && p[1].pain === 6;
})());
ok('nothing before the start counts, and nothing after a stop', (() => {
  const E = {};
  E[day(1)] = entry(5, true); E[day(2)] = entry(3, true); E[day(3)] = entry(6, true);
  E[day(4)] = entry(4, true); E[day(5)] = entry(4, true);
  const stopped = { ...EXP, status: 'stopped', endedOn: day(2) };
  return x.experimentPairs(stopped, E, day(9)).length === 2
    && x.experimentPairs({ ...EXP, from: day(3) }, E, day(9)).length === 2;
})());

/** n days from day 1: did on even days; yes-mornings `yp`, no-mornings `np` */
function record(n, yp, np, opts) {
  const E = {};
  for (let i = 1; i <= n + 1; i++) {
    const did = i % 2 === 0;
    const prevDid = (i - 1) % 2 === 0;
    const pain = i === 1 ? 5 : (prevDid ? yp : np);
    E[day(i)] = i <= n ? entry(pain, did) : entry(pain);
  }
  if (opts && opts.dropMornings) opts.dropMornings.forEach((i) => { delete E[day(i)].logs; E[day(i)].logs = []; });
  return E;
}

group('the countdown and the ending');
ok('day N of the planned length while running, with the counts so far', (() => {
  const s = x.experimentState(EXP, record(5, 3, 6), day(6));
  const c = x.experimentCopy(s);
  return s.day === 6 && s.planned === th.EXPERIMENT_DAYS && !s.ended && s.verdict === 'running'
    && s.yes === 2 && s.no === 3
    && c.title === 'Day 6 of ' + th.EXPERIMENT_DAYS + ' · “an early night”'
    && c.evidence.indexOf('2 yes and 3 no') === 0;
})());
ok('after the planned days with the floor reached each way, it ends with a verdict', (() => {
  const n = th.EXPERIMENT_DAYS;
  const s = x.experimentState(EXP, record(n, 3, 6), day(n + 2));
  return s.ended && s.verdict === 'possible' && s.delta === -3
    && s.yes >= th.EXPERIMENT_MIN_GROUP_DAYS && s.no >= th.EXPERIMENT_MIN_GROUP_DAYS;
})());
ok('short of the floor after the planned days it extends and says so', (() => {
  const n = th.EXPERIMENT_DAYS;
  // drop most of the mornings after yes-days so the yes group stays under the floor
  const E = record(n, 3, 6, { dropMornings: [3, 5, 7, 9, 11] });
  const s = x.experimentState(EXP, E, day(n + 2));
  const c = x.experimentCopy(s);
  return !s.ended && s.extended && s.verdict === 'running' && s.yes < th.EXPERIMENT_MIN_GROUP_DAYS
    && /still collecting/.test(c.title);
})());
ok('at the maximum it ends regardless — insufficient when the floor was never reached', (() => {
  const E = record(4, 3, 6);
  const s = x.experimentState(EXP, E, day(th.EXPERIMENT_MAX_DAYS + 1));
  const c = x.experimentCopy(s);
  return s.ended && s.verdict === 'insufficient' && /Not enough days/.test(c.title)
    && c.caveat && c.caveat.indexOf('an early night') >= 0;
})());
ok('alike mornings are an observation, said as a finding', (() => {
  const n = th.EXPERIMENT_DAYS;
  const s = x.experimentState(EXP, record(n, 4, 5), day(n + 2));
  const c = x.experimentCopy(s);
  return s.verdict === 'observation' && s.delta === -1
    && /No difference worth a sentence/.test(c.title) && /finding too/.test(c.caveat);
})());
ok('a done experiment is read as of its end, not today', (() => {
  const n = th.EXPERIMENT_DAYS;
  const done = { ...EXP, status: 'done', endedOn: day(n) };
  const E = record(n + 8, 3, 6);
  const a = x.experimentState(done, E, day(n + 10));
  const b = x.experimentState(EXP, record(n, 3, 6), day(n + 2));
  return a.yes === b.yes && a.no === b.no && a.day === n && a.ended;
})());

group('the words');
ok('the question is the person’s phrase, capitalised, asked about today', (() => {
  return x.experimentQuestion(EXP) === 'An early night — did it happen today?'
    && x.experimentQuestion({ ...EXP, what: '  walk on days I would skip ' })
      === 'Walk on days I would skip — did it happen today?';
})());
ok('the result names both means and both counts, carries the non-causation line, and aims no verb at the person', (() => {
  const n = th.EXPERIMENT_DAYS;
  const c = x.experimentCopy(x.experimentState(EXP, record(n, 3, 6), day(n + 2)));
  const all = c.title + ' ' + c.evidence + ' ' + c.caveat;
  return /ran 3 points lower/.test(c.title)
    && /averaged 3 \(\d+ days\); after days without, 6 \(\d+ days\)/.test(c.evidence)
    && c.caveat.indexOf('not proof of what caused what') >= 0
    && !/\b(should|keep doing|stop|try harder|well done|great)\b/i.test(all);
})());
ok('the same record gives the same words twice', (() => {
  const n = th.EXPERIMENT_DAYS;
  const E = record(n, 3, 6);
  const a = x.experimentCopy(x.experimentState(EXP, E, day(n + 2)));
  const b = x.experimentCopy(x.experimentState(EXP, E, day(n + 2)));
  return JSON.stringify(a) === JSON.stringify(b);
})());

group('a backup’s experiment');
ok('cleanExperiment keeps a real one, caps the phrase, drops junk', (() => {
  const long = 'x'.repeat(200);
  const c = x.cleanExperiment({ id: 5, what: ' ' + long, from: '2026-08-01', status: 'done', endedOn: '2026-08-15', junk: 1 });
  return c && c.what.length === x.EXPERIMENT_WHAT_MAX && c.endedOn === '2026-08-15' && !('junk' in c)
    && x.cleanExperiment({ id: 'a', what: 'x', from: '2026-08-01', status: 'done' }) === null
    && x.cleanExperiment({ id: 1, what: '', from: '2026-08-01', status: 'done' }) === null
    && x.cleanExperiment({ id: 1, what: 'x', from: 'yesterday', status: 'done' }) === null
    && x.cleanExperiment({ id: 1, what: 'x', from: '2026-08-01', status: 'paused' }) === null;
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
