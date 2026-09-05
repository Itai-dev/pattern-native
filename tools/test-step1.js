/**
 * Step 1 tests — the schema, the registry, the protocol logic, and the
 * two data-loss paths that had to close before context answers could
 * safely land on the day row.
 *
 * Same shape as test-model.js: the domain is pure TypeScript with no
 * React Native in it, so it compiles to CommonJS and runs in Node.
 *
 * What these are really checking, stated once: that "never asked",
 * "asked and skipped" and "answered" survive as three separate things
 * through cleaning, storage shapes and migration — and that nothing in
 * the write path can quietly turn one into another.
 *
 *   node tools/test-step1.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const model = require(path.join(OUT, 'model.js'));
const metrics = require(path.join(OUT, 'metrics.js'));
const protocol = require(path.join(OUT, 'protocol.js'));
const th = require(path.join(OUT, "thresholds.js"));
const scale = require(path.join(OUT, "painScale.js"));
const report = require(path.join(OUT, 'report.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 260) : ''));
};
const group = (n) => console.log('\n' + n);

const answer = (value, h, opts) => Object.assign({
  value, h: h === undefined ? 540 : h, ts: 1, tz: 0, qv: 1, pid: 1,
}, opts || {});
const ctxOf = (obj) => ({ v: 1, a: obj });

/* ── thresholds are named, and are the ones we argued for ──── */
group('thresholds');
ok('eight observations per group', th.PATTERN_MIN_N === 8);
ok('one and a half points', th.PATTERN_MIN_DELTA === 1.5);
ok('the SD multiplier ships off', th.PATTERN_SD_MULTIPLIER === 0);
ok('one card at a time', th.PATTERN_MAX_CARDS === 1);
ok('terciles need three weeks', th.TERCILE_MIN_DAYS === 21);
ok('a band needs five check-ins across three days',
  th.BAND_MIN_CHECKINS === 5 && th.BAND_MIN_DAYS === 3);
ok('the retired rule is not hiding in here', th.PATTERN_MIN_N !== 4 && th.PATTERN_MIN_DELTA !== 1);

/* ── the registry ───────────────────────────────────────────── */
group('metric registry');
ok('ids are unique', (() => {
  const seen = {};
  for (const m of metrics.METRICS) { if (seen[m.id]) return false; seen[m.id] = true; }
  return true;
})());
ok('every metric carries a wording version',
  metrics.METRICS.every((m) => typeof m.wordingVersion === 'number' && m.wordingVersion >= 1));
ok('every ordinal declares its extremes',
  metrics.METRICS.filter((m) => m.type === 'ordinal' && m.protocolEligible)
    .every((m) => Array.isArray(m.extremes) && m.extremes.length === 2));
ok('extremes name levels that exist', (() => {
  for (const m of metrics.METRICS) {
    if (!m.extremes || !m.levels) continue;
    const ids = m.levels.map((l) => l.id);
    if (ids.indexOf(m.extremes[0]) < 0 || ids.indexOf(m.extremes[1]) < 0) return false;
  }
  return true;
})());
ok('extremes are the ENDS, never the middle', (() => {
  for (const m of metrics.METRICS) {
    if (!m.extremes || !m.levels || m.levels.length < 3) continue;
    const ids = m.levels.map((l) => l.id);
    if (m.extremes[0] !== ids[0] || m.extremes[1] !== ids[ids.length - 1]) return false;
  }
  return true;
})());
ok('a protocol can pick from more than a couple of factors',
  metrics.protocolFactors().length >= 8, metrics.protocolFactors().length);
ok('cycle, food and medication are NOT protocol-eligible', (() => {
  return ['cycle.phase.v1', 'food.intake.v1', 'medication.change.v1']
    .every((id) => metrics.getMetric(id) && !metrics.getMetric(id).protocolEligible);
})());
ok('...and each says why, so the setup flow can be honest about it',
  ['cycle.phase.v1', 'food.intake.v1', 'medication.change.v1']
    .every((id) => !!metrics.getMetric(id).excludedBecause));
ok('the shipped quality vocabulary is intact — neuropathic words included',
  ['tingling', 'numb', 'sensitive', 'stabbing', 'pressure']
    .every((id) => model.QUALITYIDS.indexOf(id) >= 0));
ok('a value the metric could not produce is rejected',
  metrics.validAnswerValue('sleep.quality.v1', 'good') === true
  && metrics.validAnswerValue('sleep.quality.v1', 'excellent') === false
  && metrics.validAnswerValue('pain.interference.v1', 7) === true
  && metrics.validAnswerValue('pain.interference.v1', 77) === false);

/* ── the local hypothesis matcher ───────────────────────────── */
group('hypothesis matcher (local, no network)');
ok('finds stress and weather in a sentence', (() => {
  const ids = metrics.matchFactors('I think stress and cold weather make my migraines worse')
    .map((m) => m.id);
  return ids.indexOf('stress.level.v1') >= 0 && ids.indexOf('weather.felt.v1') >= 0;
})());
ok('finds sleep on the helps side',
  metrics.matchFactors('sleep and heat help').map((m) => m.id).indexOf('sleep.quality.v1') >= 0);
ok('empty text matches nothing',
  metrics.matchFactors('').length === 0 && metrics.matchFactors('   ').length === 0);
ok('a cycle hypothesis surfaces as an EXCLUSION, not a proxy', (() => {
  const ex = metrics.matchedExclusions('I think my period affects it').map((m) => m.id);
  return ex.indexOf('cycle.phase.v1') >= 0;
})());

/* ── eligibility: ask only what the moment can answer ───────── */
group('eligibility windows');
const M = 60;
ok('sleep is asked on the first morning check-in',
  metrics.eligibleNow('firstOfDayMorning', 8 * M, true, false) === true);
ok('sleep is NOT asked at nine in the evening',
  metrics.eligibleNow('firstOfDayMorning', 21 * M, true, false) === false);
ok('sleep is NOT asked on a later check-in, even a morning one',
  metrics.eligibleNow('firstOfDayMorning', 9 * M, false, false) === false);
ok('load is asked from 17:00',
  metrics.eligibleNow('firstAfter1700', 17 * M, false, false) === true);
ok('load is not asked at 16:59',
  metrics.eligibleNow('firstAfter1700', 16 * M + 59, false, false) === false);
ok('load is not asked after midnight — that is the next day',
  metrics.eligibleNow('firstAfter1700', 1 * M, true, false) === false);
ok('nothing day-scoped is asked twice',
  metrics.eligibleNow('firstOfDay', 9 * M, true, true) === false
  && metrics.eligibleNow('firstAfter1700', 19 * M, false, true) === false);
ok('the bands are one definition, shared with the report',
  report.bandOf(8 * M) === metrics.bandOf(8 * M) && report.bandOf(23 * M) === 'night');

/* ── three states, never two ────────────────────────────────── */
group('unasked vs skipped vs answered');
const dayAnswered = { pain: 5, cap: null, note: '', ctx: ctxOf({ 'sleep.quality.v1': answer('poor') }) };
const daySkipped = { pain: 5, cap: null, note: '', ctx: ctxOf({ 'sleep.quality.v1': answer('', 540, { skipped: 1 }) }) };
const dayUnasked = { pain: 5, cap: null, note: '' };
ok('an answer reads back', model.valueOf(dayAnswered, 'sleep.quality.v1') === 'poor');
ok('a skip is present but has no value',
  model.answerOf(daySkipped, 'sleep.quality.v1') !== null
  && model.valueOf(daySkipped, 'sleep.quality.v1') === null);
ok('unasked is absent entirely',
  model.answerOf(dayUnasked, 'sleep.quality.v1') === null);
ok('a skip is NOT a low answer — the two never collapse',
  model.valueOf(daySkipped, 'sleep.quality.v1') !== 'poor'
  && model.valueOf(daySkipped, 'sleep.quality.v1') !== 0);
ok('cleaning keeps a skip a skip', (() => {
  const c = model.cleanCtx(daySkipped.ctx);
  return c && c.a['sleep.quality.v1'].skipped === 1;
})());
ok('an unknown metric id is dropped, never stored',
  model.cleanCtx(ctxOf({ 'not.a.metric.v9': answer('poor') })) === undefined);
ok('a value outside the metric is dropped, never coerced',
  model.cleanCtx(ctxOf({ 'sleep.quality.v1': answer('splendid') })) === undefined);
ok('a mixed block keeps the good and drops the bad', (() => {
  const c = model.cleanCtx(ctxOf({
    'sleep.quality.v1': answer('good'),
    'stress.level.v1': answer('enormous'),
  }));
  return c && Object.keys(c.a).length === 1 && c.a['sleep.quality.v1'].value === 'good';
})());

/* ── the data-loss path that had to close ───────────────────── */
group('removeMoment keeps whatever the user put there');
const withCtx = model.applyMoment(
  { pain: 4, cap: null, note: '', ctx: ctxOf({ 'stress.level.v1': answer('high') }) },
  600, 4
);
ok('the write carries context forward', model.hasCtx(withCtx));
ok('deleting the only moment KEEPS a day holding context', (() => {
  const after = model.removeMoment(withCtx, 600);
  return after !== null && model.valueOf(after, 'stress.level.v1') === 'high' && !after.logs;
})());
ok('a note still anchors a day, as it always did', (() => {
  const e = model.applyMoment({ pain: 4, cap: null, note: 'sore' }, 600, 4);
  return model.removeMoment(e, 600) !== null;
})());
ok('cap anchors a day too', (() => {
  const e = model.applyMoment({ pain: 4, cap: 6, note: '' }, 600, 4);
  return model.removeMoment(e, 600) !== null;
})());
ok('an asked-and-empty factor list anchors a day', (() => {
  const e = model.applyMoment({ pain: 4, cap: null, note: '', factors: [] }, 600, 4);
  return model.removeMoment(e, 600) !== null;
})());
ok('a day holding nothing else still goes', (() => {
  const e = model.applyMoment(null, 600, 4);
  return model.removeMoment(e, 600) === null;
})());

/* ── UTC and offset: additive, and never invented ───────────── */
group('timestamps');
ok('a write records the instant and the offset', (() => {
  const e = model.applyMoment(null, 600, 5, null, null, { ts: 1700000000000, tz: 120, sv: 3 });
  const m = e.logs[0];
  return m.ts === 1700000000000 && m.tz === 120 && m.sv === 3;
})());
ok('a write without meta stores no stamp — absent, not zero', (() => {
  const m = model.applyMoment(null, 600, 5).logs[0];
  return m.ts === undefined && m.tz === undefined;
})());
ok('legacy moments stay offset-unknown through cleaning', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5 }]);
  return logs[0].ts === undefined && logs[0].tz === undefined;
})());
ok('a negative offset survives — west of Greenwich is not an error', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5, ts: 1, tz: -300 }]);
  return logs[0].tz === -300;
})());
ok('an absurd offset is dropped rather than stored', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5, ts: 1, tz: 5000 }]);
  return logs[0].tz === undefined;
})());
ok('editing a moment in place keeps its ORIGINAL capture stamp', (() => {
  const first = model.applyMoment(null, 600, 5, null, null, { ts: 111, tz: 60 });
  const edited = model.applyMoment(first, 600, 8);
  return edited.logs.length === 1 && edited.logs[0].pain === 8 && edited.logs[0].ts === 111;
})());
ok('nowMeta produces a real instant and a plausible offset', (() => {
  const m = model.nowMeta(3);
  return typeof m.ts === 'number' && m.ts > 0
    && typeof m.tz === 'number' && m.tz >= -18 * 60 && m.tz <= 18 * 60 && m.sv === 3;
})());

/* ── body areas: asked-and-empty is an answer ───────────────── */
group('body-area tri-state');
ok('selecting areas marks the question as asked', (() => {
  const m = model.applyMoment(null, 600, 5, ['hands'], null).logs[0];
  return m.locAsked === 1 && m.loc[0] === 'hands';
})());
ok('asked with nothing chosen survives as asked', (() => {
  const m = model.applyMoment(null, 600, 5, null, null, { locAsked: true }).logs[0];
  return m.locAsked === 1 && m.loc === undefined;
})());
ok('never asked leaves no marker', (() => {
  const m = model.applyMoment(null, 600, 5).logs[0];
  return m.locAsked === undefined && m.loc === undefined;
})());
ok('an empty array from a backup reads as asked, not as unasked', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5, loc: [] }]);
  return logs[0].locAsked === 1 && logs[0].loc === undefined;
})());
ok('unknown region ids are still dropped', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5, loc: ['hands', 'tail'] }]);
  return logs[0].loc.length === 1 && logs[0].loc[0] === 'hands';
})());

/* ── the character question, now asked once a day ────────────
   The same three states the where step has always kept. They matter for
   `q` only now that the question is not put at every check-in: before,
   silence could only mean "nothing fit". */
group('pain-character tri-state');
ok('choosing words marks the question as asked', (() => {
  const m = model.applyMoment(null, 600, 5, null, ['aching']).logs[0];
  return m.qAsked === 1 && m.q[0] === 'aching';
})());
ok('asked with nothing chosen survives as asked', (() => {
  const m = model.applyMoment(null, 600, 5, null, null, { qAsked: true }).logs[0];
  return m.qAsked === 1 && m.q === undefined;
})());
ok('a later check-in that never saw the question carries no marker', (() => {
  const m = model.applyMoment(null, 600, 5, ['hands'], null, { locAsked: true }).logs[0];
  return m.qAsked === undefined && m.q === undefined;
})());
ok('editing a moment cannot erase that it was asked', (() => {
  let e = model.applyMoment(null, 600, 5, null, ['burning']);
  e = model.applyMoment(e, 600, 7);              // same minute, no meta
  return e.logs[0].qAsked === 1;
})());
ok('the marker survives a backup round-trip', (() => {
  const logs = model.cleanLogs([{ h: 600, pain: 5, qAsked: 1 }]);
  return logs[0].qAsked === 1 && logs[0].q === undefined;
})());

/* ── events: two response formats, never mapped together ────── */
group('events');
ok('the picker no longer offers sleep',
  model.EVENT_KINDS_OFFERED.indexOf('sleep') < 0);
ok('...but a stored sleep event still reads back', (() => {
  const ev = model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'sleep', text: 'bad night' });
  return ev !== null && ev.kind === 'sleep';
})());
ok('medication and illness are accepted',
  model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'medication', text: '' }) !== null
  && model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'illness', text: '' }) !== null);
ok('an intervention and a four-level response round-trip', (() => {
  const ev = model.cleanEvent({
    date: '2026-08-01', h: 600, kind: 'treatment', text: '',
    intervention: 'heat', resp: 'better',
  });
  return ev.intervention === 'heat' && ev.resp === 'better';
})());
ok('"not sure" is stored as an answer, not dropped as a skip',
  model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'treatment', text: '', resp: 'unsure' }).resp === 'unsure');
ok('an invented response is dropped',
  model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'treatment', text: '', resp: 'amazing' }).resp === undefined);
ok('a legacy 0-10 impression is untouched and NOT converted', (() => {
  const ev = model.cleanEvent({ date: '2026-08-01', h: 600, kind: 'treatment', text: '', helped: 7 });
  return ev.helped === 7 && ev.resp === undefined;
})());
ok('identity separates two events that differ only by response', (() => {
  const a = { date: '2026-08-01', h: 600, kind: 'treatment', text: 'heat', resp: 'better' };
  const b = { date: '2026-08-01', h: 600, kind: 'treatment', text: 'heat', resp: 'worse' };
  return model.eventKey(a) !== model.eventKey(b);
})());

/* ── protocols ──────────────────────────────────────────────── */
group('protocols');
ok('the second factor is never the chosen one', (() => {
  const p = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, 0);
  return p && p.factor.id !== 'stress.level.v1';
})());
ok('the second factor is never one the user named', (() => {
  const named = ['stress.level.v1', 'weather.felt.v1', 'sleep.quality.v1'];
  for (let r = 0; r < 12; r++) {
    const p = protocol.pickSecondFactor('stress.level.v1', named, null, r);
    if (!p || named.indexOf(p.factor.id) >= 0) return false;
  }
  return true;
})());
ok('the second factor is never the previous period\'s', (() => {
  for (let r = 0; r < 12; r++) {
    const p = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], 'sleep.quality.v1', r);
    if (!p || p.factor.id === 'sleep.quality.v1') return false;
  }
  return true;
})());
ok('the same inputs always give the same answer', (() => {
  const a = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, 3);
  const b = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, 3);
  return a.factor.id === b.factor.id;
})());
ok('rotating moves on', (() => {
  const a = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, 0);
  const b = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, a.nextRotation);
  return a.factor.id !== b.factor.id;
})());
ok('a user who names the whole library still gets a second factor', (() => {
  const all = metrics.protocolFactors().map((m) => m.id);
  const p = protocol.pickSecondFactor('stress.level.v1', all, null, 0);
  return p !== null && p.factor.id !== 'stress.level.v1';
})());
ok('the review lands on day 14', (() => {
  return protocol.reviewDateFor('2026-08-01') === '2026-08-14';
})());

const proto = {
  id: 1, version: 1, startDate: '2026-08-01', endDate: null, reviewOn: '2026-08-14',
  chosenFactor: 'stress.level.v1', secondFactor: 'load.physical.v1',
  hypothesisId: 1, status: 'active',
};
ok('day numbering is 1-based from the start',
  protocol.dayNumber(proto, '2026-08-01') === 1 && protocol.dayNumber(proto, '2026-08-14') === 14);
ok('the review is not due early and is due on the day',
  protocol.reviewDue(proto, '2026-08-13') === false && protocol.reviewDue(proto, '2026-08-14') === true);

ok('a morning check-in asks stress but not load', (() => {
  const ids = protocol.questionsNow(proto, { h: 8 * M, isFirstOfDay: true, entry: null });
  return ids.indexOf('stress.level.v1') >= 0 && ids.indexOf('load.physical.v1') < 0;
})());
ok('an evening check-in asks both', (() => {
  const ids = protocol.questionsNow(proto, { h: 19 * M, isFirstOfDay: true, entry: null });
  return ids.indexOf('stress.level.v1') >= 0 && ids.indexOf('load.physical.v1') >= 0;
})());
ok('the evening follow-up offers only what is still missing', (() => {
  const entry = { pain: 5, cap: null, note: '', ctx: ctxOf({ 'stress.level.v1': answer('high') }) };
  const ids = protocol.eveningFollowUps(proto, { h: 19 * M, isFirstOfDay: false, entry });
  return ids.length === 1 && ids[0] === 'load.physical.v1';
})());
ok('a question already answered is not asked again', (() => {
  const entry = { pain: 5, cap: null, note: '', ctx: ctxOf({ 'stress.level.v1': answer('high') }) };
  const ids = protocol.questionsNow(proto, { h: 9 * M, isFirstOfDay: true, entry });
  return ids.indexOf('stress.level.v1') < 0;
})());
ok('a SKIPPED question is not re-asked the same day either', (() => {
  const entry = { pain: 5, cap: null, note: '', ctx: ctxOf({ 'stress.level.v1': answer('', 540, { skipped: 1 }) }) };
  const ids = protocol.questionsNow(proto, { h: 9 * M, isFirstOfDay: true, entry });
  return ids.indexOf('stress.level.v1') < 0;
})());

/* ── the review reports completeness, and only completeness ── */
group('review progress');
const revEntries = {};
for (let i = 0; i < 10; i++) {
  const d = '2026-08-' + String(i + 1).padStart(2, '0');
  revEntries[d] = {
    pain: 5, cap: null, note: '',
    logs: [{ h: 540, pain: 5 }],
    ctx: ctxOf({ 'stress.level.v1': answer(i < 6 ? 'high' : 'low') }),
  };
}
revEntries['2026-08-11'] = {
  pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }],
  ctx: ctxOf({ 'stress.level.v1': answer('', 540, { skipped: 1 }) }),
};
const prog = protocol.reviewProgress(proto, revEntries, '2026-08-14');
const stressProg = prog.factors.filter((f) => f.metricId === 'stress.level.v1')[0];
ok('logged days are counted', prog.loggedDays === 11, prog.loggedDays);
ok('extremes are counted separately',
  stressProg.highCount === 6 && stressProg.lowCount === 4,
  [stressProg.highCount, stressProg.lowCount]);
ok('a skip counts as a skip, not as an answer',
  stressProg.answered === 10 && stressProg.skipped === 1,
  [stressProg.answered, stressProg.skipped]);
ok('the target shown is the real one', stressProg.needed === th.PATTERN_MIN_N);
ok('six and four is NOT comparable', stressProg.comparable === false);
ok('the progress sentence is group sizes only — no pain anywhere', (() => {
  const s = protocol.progressSentence(stressProg);
  return s.indexOf('6') >= 0 && s.indexOf('4') >= 0
    && !/pain|higher|lower|average/i.test(s);
})(), protocol.progressSentence(stressProg));
ok('a morning factor IS reachable for someone who logs at 09:00', (() => {
  const morningProto = Object.assign({}, proto, { secondFactor: 'sleep.quality.v1' });
  const p = protocol.reviewProgress(morningProto, revEntries, '2026-08-14');
  return p.unreachable.indexOf('sleep.quality.v1') < 0;
})());
ok('an evening-only logger who picked sleep is told it is unreachable', (() => {
  /* the case worth naming out loud: sleep is asked in the morning, this
     person only ever logs at 21:00, and without this they would collect
     nothing for weeks and never be told why */
  const eveningOnly = {};
  for (let i = 8; i <= 14; i++) {
    const d = '2026-08-' + String(i).padStart(2, '0');
    eveningOnly[d] = { pain: 5, cap: null, note: '', logs: [{ h: 21 * M, pain: 5 }] };
  }
  const morningProto = Object.assign({}, proto, { secondFactor: 'sleep.quality.v1' });
  const p = protocol.reviewProgress(morningProto, eveningOnly, '2026-08-14');
  return p.unreachable.indexOf('sleep.quality.v1') >= 0
    && p.unreachable.indexOf('stress.level.v1') < 0;
})());
ok('...and a factor they DO answer is not flagged',
  prog.unreachable.indexOf('stress.level.v1') < 0);

/* ── time-of-day sufficiency ────────────────────────────────── */
group('band sufficiency');
const bandEntries = {};
const bandDays = [];
for (let i = 0; i < 8; i++) {
  const d = '2026-09-' + String(i + 1).padStart(2, '0');
  const logs = [{ h: 9 * M, pain: 4 }];
  if (i === 0) logs.push({ h: 23 * M, pain: 9 });   // one lone night reading
  bandEntries[d] = { pain: 9, cap: null, note: '', logs };
  bandDays.push({ date: d, avg: 4, count: logs.length });
}
const bands = report.timeOfDayBands(bandEntries, bandDays);
ok('a band resting on eight check-ins across eight days appears',
  bands.some((b) => b.key === 'morning'));
ok('a band resting on ONE check-in does not', !bands.some((b) => b.key === 'night'), bands.map((b) => b.key));
ok('many check-ins from too few days do not qualify either', (() => {
  const e = {
    '2026-09-01': {
      pain: 9, cap: null, note: '',
      logs: [{ h: 22 * M, pain: 9 }, { h: 22 * M + 10, pain: 9 }, { h: 22 * M + 20, pain: 9 },
        { h: 22 * M + 30, pain: 9 }, { h: 22 * M + 40, pain: 9 }, { h: 22 * M + 50, pain: 9 }],
    },
  };
  const d = [{ date: '2026-09-01', avg: 9, count: 6 }];
  return report.timeOfDayBands(e, d).length === 0;
})());

/* ── backups: nothing older stops restoring ─────────────────── */
group('backup v1 → v6');
ok('the version moved to 6', model.BACKUP_VERSION === 6);
ok('a v1 file (entries only) still restores', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 1, entries: { '2026-01-01': { pain: 5, cap: null, note: '' } },
  }));
  return b !== null && Object.keys(b.entries).length === 1
    && b.hypotheses.length === 0 && b.protocols.length === 0;
})());
ok('a v4 file restores with the new sections simply empty', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 4, entries: {}, events: [], func: [{ week: '2026-01-05', ability: 6 }], goal: 'walking',
  }));
  return b !== null && b.func.length === 1 && b.goal === 'walking'
    && b.hypotheses.length === 0 && b.protocols.length === 0 && b.modifiers.length === 0;
})());
ok('a v5 file carries context, hypotheses and protocols', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 5,
    entries: {
      '2026-08-01': {
        pain: 5, cap: null, note: '',
        logs: [{ h: 540, pain: 5, ts: 111, tz: 60, sv: 3 }],
        ctx: ctxOf({ 'sleep.quality.v1': answer('poor') }),
      },
    },
    events: [], func: [], goal: null,
    hypotheses: [{ createdOn: '2026-08-01', understand: 'why mornings', harder: 'stress', helps: 'heat' }],
    protocols: [{
      version: 1, startDate: '2026-08-01', endDate: null, reviewOn: '2026-08-14',
      chosenFactor: 'stress.level.v1', secondFactor: 'load.physical.v1',
      hypothesisId: 1, status: 'active',
    }],
    modifiers: ['heatBetter', 'coldBetter'],
  }));
  if (!b) return false;
  const day = b.entries['2026-08-01'];
  return day.ctx.a['sleep.quality.v1'].value === 'poor'
    && day.logs[0].ts === 111 && day.logs[0].tz === 60
    && b.hypotheses.length === 1 && b.hypotheses[0].understand === 'why mornings'
    && b.protocols.length === 1 && b.protocols[0].chosenFactor === 'stress.level.v1'
    && b.modifiers.length === 2;
})());
ok('a protocol naming a metric that no longer exists is dropped', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 5, entries: {},
    protocols: [{
      version: 1, startDate: '2026-08-01', endDate: null, reviewOn: '2026-08-14',
      chosenFactor: 'moon.phase.v1', secondFactor: 'load.physical.v1',
      hypothesisId: null, status: 'active',
    }],
  }));
  return b !== null && b.protocols.length === 0;
})());
ok('three blank answers is not a hypothesis', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 5, entries: {},
    hypotheses: [{ createdOn: '2026-08-01', understand: '', harder: '', helps: '' }],
  }));
  return b !== null && b.hypotheses.length === 0;
})());
ok('a file that is not ours is still refused',
  model.validateBackup('{"hello":"world"}') === null
  && model.validateBackup('not json at all') === null);

/* ── migration is idempotent and touches nothing clean ──────── */
group('migration');
ok('a clean store needs no corrections', (() => {
  const entries = {
    '2026-08-01': {
      pain: 5, cap: null, note: '',
      logs: [{ h: 540, pain: 5, ts: 111, tz: 60 }],
      ctx: ctxOf({ 'stress.level.v1': answer('high') }),
    },
  };
  const r = model.migrateEntries(entries);
  return r.corrected === 0;
})());
ok('migration carries context through untouched', (() => {
  const entries = {
    '2026-08-01': {
      pain: 5.4, cap: null, note: '',
      logs: [{ h: 540, pain: 5 }],
      ctx: ctxOf({ 'stress.level.v1': answer('high') }),
    },
  };
  const r = model.migrateEntries(entries);
  return model.valueOf(r.entries['2026-08-01'], 'stress.level.v1') === 'high';
})());
ok('running it twice changes nothing the second time', (() => {
  const entries = { '2026-08-01': { pain: 5.4, cap: null, note: '' } };
  const once = model.migrateEntries(entries);
  const twice = model.migrateEntries(once.entries);
  return once.corrected === 1 && twice.corrected === 0;
})());

/* ── the two ends of the record ─────────────────────────────── */
group('hardest and easiest days');

/** n logged days; `painAt(i)` gives each day its value */
const record = (n, painAt, locAt) => {
  const entries = {}; const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 0, 1); d.setDate(d.getDate() + i);
    const k = model.iso(d);
    const p = painAt(i);
    const m = { h: 9 * M, pain: p };
    if (locAt) { m.loc = [locAt(i)]; m.q = [p >= 7 ? 'burning' : 'aching']; }
    entries[k] = { pain: p, cap: null, note: '', logs: [m] };
    days.push({ date: k, avg: p, count: 1 });
  }
  return [entries, days];
};

ok('under three weeks there are no ends yet', (() => {
  const [e, d] = record(20, (i) => (i % 2 ? 2 : 9));
  return report.harderEasierOf(e, d) === null;
})());
ok('a flat record has no meaningfully harder third', (() => {
  // 5,5,6,5,6… — a third of these is not different from another third
  const [e, d] = record(30, (i) => (i % 2 ? 5 : 6));
  return report.harderEasierOf(e, d) === null;
})());
ok('a record with real spread splits into two ends', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9));
  const he = report.harderEasierOf(e, d);
  return he !== null && he.harder.days === 10 && he.easier.days === 10;
})());
ok('the middle third is discarded, and says so', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9));
  const he = report.harderEasierOf(e, d);
  return he.middleDays === 10;
})());
ok('the harder end really is the harder one', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9));
  const he = report.harderEasierOf(e, d);
  return he.harder.avg === 9 && he.easier.avg === 2
    && he.boundaryHigh === 9 && he.boundaryLow === 2;
})());
ok('each end describes what was recorded on it', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), (i) => (i < 20 ? 'knees' : 'hands'));
  const he = report.harderEasierOf(e, d);
  return he.harder.locations[0].id === 'hands' && he.harder.locations[0].days === 10
    && he.easier.locations[0].id === 'knees'
    && he.harder.qualities[0].id === 'burning'
    && he.easier.qualities[0].id === 'aching';
})());
ok('the ends describe the PAIN and never the factors', (() => {
  /* the line this section must not cross: a factor breakdown here would
     be the engine's comparison, run at whatever n happened to exist and
     with the arithmetic left to the reader */
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  Object.keys(e).forEach((k, i) => {
    e[k].ctx = ctxOf({ 'stress.level.v1': answer(i >= 20 ? 'high' : 'low') });
  });
  const he = report.harderEasierOf(e, d);
  const keys = Object.keys(he.harder);
  return keys.indexOf('factors') < 0 && keys.indexOf('ctx') < 0
    && JSON.stringify(he).indexOf('stress') < 0;
})());

/* ── what was different between the two ends ─────────────────
   Places and words that sit mostly on one end, with day counts on both
   sides. Still only the pain's own description; the gates are named in
   thresholds.ts. */
ok('a word carried only by the hard days is a contrast, with its counts', (() => {
  // easy days: knees/aching; hard days: hands/burning — clean separation
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), (i) => (i < 20 ? 'knees' : 'hands'));
  const he = report.harderEasierOf(e, d);
  const burning = he.contrasts.filter((c) => c.id === 'burning')[0];
  const hands = he.contrasts.filter((c) => c.id === 'hands')[0];
  return burning && burning.kind === 'quality'
    && burning.harderDays === 10 && burning.easierDays === 0
    && hands && hands.kind === 'location'
    && hands.harderDays === 10 && hands.easierDays === 0;
})());
ok('a place both ends share is not a difference', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  const he = report.harderEasierOf(e, d);
  return he.contrasts.every((c) => c.id !== 'hands');
})());
ok('two days of anything is an anecdote, not a contrast', (() => {
  /* clears the share gap easily on the location — but the word rides
     only two hard days, under TERCILE_CONTRAST_MIN_DAYS */
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), (i) => (i < 20 ? 'knees' : 'hands'));
  Object.keys(e).sort().forEach((k, i) => {
    e[k].logs[0].q = i >= 28 ? ['stabbing'] : [];
  });
  const he = report.harderEasierOf(e, d);
  return he.contrasts.every((c) => c.id !== 'stabbing');
})());
ok('the contrasts are capped and carry both denominators', (() => {
  const [e, d] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), (i) => (i < 20 ? 'knees' : 'hands'));
  const he = report.harderEasierOf(e, d);
  return he.contrasts.length <= 5
    && he.harder.days === 10 && he.easier.days === 10;
})());
ok('a record with ends carries them into the report data', (() => {
  const [e] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  const last = Object.keys(e).sort().pop();
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null, todayIso: last, windowDays: 90,
  });
  return data.harderEasier !== null && data.harderEasier.harder.days === 10;
})());
ok('the PDF prints the section, with the caveat attached', (() => {
  const [e] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  const last = Object.keys(e).sort().pop();
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null, todayIso: last, windowDays: 90,
  });
  const html = report.reportHtml(data);
  return html.indexOf('Hardest and easiest days') > 0
    && /does not identify a cause/.test(html)
    && /middle third/.test(html);
})());
ok('a short record prints no such section', (() => {
  const [e] = record(10, (i) => (i < 5 ? 2 : 9), () => 'hands');
  const last = Object.keys(e).sort().pop();
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null, todayIso: last, windowDays: 90,
  });
  return data.harderEasier === null
    && report.reportHtml(data).indexOf('Hardest and easiest days') < 0;
})());

/* ── what the check-in asks ─────────────────────────────────── */
group('check-in questions');

const INTERF = 'pain.interference.v1';

ok('with no protocol, interference is still asked once a day', (() => {
  const ids = protocol.questionsNow(null, { h: 9 * M, isFirstOfDay: true, entry: null }, [INTERF]);
  return ids.length === 1 && ids[0] === INTERF;
})());
ok('...and not again on a later check-in the same day', (() => {
  const entry = { pain: 5, cap: null, note: '', ctx: ctxOf({ [INTERF]: answer(6) }) };
  return protocol.questionsNow(null, { h: 15 * M, isFirstOfDay: false, entry }, [INTERF]).length === 0;
})());
ok('with a protocol, the factors come first and interference last', (() => {
  const ids = protocol.questionsNow(proto, { h: 19 * M, isFirstOfDay: true, entry: null }, [INTERF]);
  return ids.length === 3 && ids[2] === INTERF
    && ids[0] === 'stress.level.v1' && ids[1] === 'load.physical.v1';
})());
ok('a morning check-in with an evening factor asks two, not three', (() => {
  const ids = protocol.questionsNow(proto, { h: 8 * M, isFirstOfDay: true, entry: null }, [INTERF]);
  return ids.length === 2 && ids.indexOf('load.physical.v1') < 0;
})());
ok('the same extra passed twice is asked once', (() => {
  const ids = protocol.questionsNow(null, { h: 9 * M, isFirstOfDay: true, entry: null },
    [INTERF, INTERF]);
  return ids.length === 1;
})());
ok('a numeric answer is accepted, an out-of-range one is not',
  metrics.validAnswerValue(INTERF, 0) && metrics.validAnswerValue(INTERF, 10)
  && !metrics.validAnswerValue(INTERF, 11) && !metrics.validAnswerValue(INTERF, -1));

group('where: confirmed, not assumed');
ok('Same records the previous areas as answered', (() => {
  const e = model.applyMoment(null, 600, 5, ['hands', 'neck'], null, { locAsked: true });
  const m = e.logs[0];
  return m.locAsked === 1 && m.loc.length === 2 && m.locSkipped === undefined;
})());
ok('Change with nothing picked is "asked, no areas" — not "unasked"', (() => {
  const m = model.applyMoment(null, 600, 5, [], null, { locAsked: true }).logs[0];
  return m.locAsked === 1 && m.loc === undefined && m.locSkipped === undefined;
})());
ok('Skip is its own state, distinct from both', (() => {
  const m = model.applyMoment(null, 600, 5, null, null, { locSkipped: true }).logs[0];
  return m.locSkipped === 1 && m.locAsked === 1 && m.loc === undefined;
})());
ok('a pain-only log was never asked at all', (() => {
  const m = model.applyMoment(null, 600, 5).logs[0];
  return m.locAsked === undefined && m.locSkipped === undefined;
})());
ok('the three states survive a backup round-trip', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 5,
    entries: {
      '2026-08-01': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5, loc: ['hands'], locAsked: 1 }] },
      '2026-08-02': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5, locAsked: 1 }] },
      '2026-08-03': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5, locSkipped: 1 }] },
      '2026-08-04': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] },
    },
  }));
  const at = (d) => b.entries['2026-08-0' + d].logs[0];
  return at(1).loc.length === 1 && at(1).locAsked === 1
    && at(2).locAsked === 1 && at(2).loc === undefined && at(2).locSkipped === undefined
    && at(3).locSkipped === 1 && at(3).locAsked === 1
    && at(4).locAsked === undefined;
})());
ok('editing a moment does not resurrect a skip once areas are given', (() => {
  const first = model.applyMoment(null, 600, 5, null, null, { locSkipped: true });
  const edited = model.applyMoment(first, 600, 5, ['hands'], null, { locAsked: true });
  return edited.logs[0].loc.length === 1 && edited.logs[0].locSkipped === undefined;
})());

/* ── the hypothesis loop, end to end ────────────────────────── */
group('the focus flow');

ok('a sentence about stress and cold weather proposes both', (() => {
  const ids = metrics.matchFactors('stress and cold weather make it worse')
    .filter((m) => m.protocolEligible).map((m) => m.id);
  return ids.indexOf('stress.level.v1') >= 0 && ids.indexOf('weather.felt.v1') >= 0;
})());
ok('picking stress never hands back stress or weather as the second', (() => {
  const matched = metrics.matchFactors('stress and cold weather make it worse').map((m) => m.id);
  const p = protocol.pickSecondFactor('stress.level.v1', matched, null, 0);
  return p && p.factor.id !== 'stress.level.v1' && p.factor.id !== 'weather.felt.v1';
})());
ok('the second factor is always one a protocol can actually run', (() => {
  for (let r = 0; r < 15; r++) {
    const p = protocol.pickSecondFactor('stress.level.v1', ['stress.level.v1'], null, r);
    if (!p || !p.factor.protocolEligible) return false;
  }
  return true;
})());
ok('a period runs from today and reviews thirteen days later', (() => {
  return protocol.reviewDateFor('2026-08-24') === '2026-09-06'
    && protocol.dayNumber({ ...proto, startDate: '2026-08-24' }, '2026-09-06') === 14;
})());

group('the day-14 review says how much, never what');
const focusProto = {
  id: 9, version: 1, startDate: '2026-08-01', endDate: null, reviewOn: '2026-08-14',
  chosenFactor: 'stress.level.v1', secondFactor: 'load.physical.v1',
  hypothesisId: 1, status: 'active',
};
const focusEntries = {};
for (let i = 1; i <= 14; i++) {
  const d = '2026-08-' + String(i).padStart(2, '0');
  focusEntries[d] = {
    pain: i > 7 ? 8 : 3, cap: null, note: '',
    logs: [{ h: 9 * M, pain: i > 7 ? 8 : 3 }],
    /* a deliberately lopsided record: high stress on exactly the painful
       days, which is the shape a naive reader would call a finding */
    ctx: ctxOf({ 'stress.level.v1': answer(i > 7 ? 'high' : 'low') }),
  };
}
const rev = protocol.reviewProgress(focusProto, focusEntries, '2026-08-14');
const revStress = rev.factors.filter((f) => f.metricId === 'stress.level.v1')[0];
ok('it counts the groups', revStress.highCount === 7 && revStress.lowCount === 7,
  [revStress.highCount, revStress.lowCount]);
ok('seven and seven is still short of the gate', revStress.comparable === false);
ok('the sentence carries no pain value, even when the record looks like an answer', (() => {
  const s = protocol.progressSentence(revStress);
  return !/pain|higher|lower|worse|better|average|\/10/i.test(s);
})(), protocol.progressSentence(revStress));
ok('nothing in the whole progress object leaks a pain figure', (() => {
  const j = JSON.stringify(rev);
  return j.indexOf('"avg"') < 0 && j.indexOf('"mean') < 0 && j.indexOf('delta') < 0;
})());
ok('the factor never asked is reported as unreachable, not as zero', (() => {
  const load = rev.factors.filter((f) => f.metricId === 'load.physical.v1')[0];
  return load.answered === 0 && rev.unreachable.indexOf('load.physical.v1') >= 0;
})());

/* ── the chips ──────────────────────────────────────────────── */
group('what you pointed at');

const WORSE = metrics.IMPACT_WORSE, BETTER = metrics.IMPACT_BETTER;
const listAns = (ids, h) => ({ value: '', values: ids, h: h || 540, ts: 1, tz: 0, qv: 1, pid: null });

ok('every chip that names something measurable points at a real metric', (() => {
  return metrics.IMPACT_CHIPS.every((c) => !c.promotesTo || metrics.getMetric(c.promotesTo) != null);
})());
ok('medication is recordable and will never be promoted', (() => {
  const c = metrics.impactChip('meds');
  return c != null && !c.promotesTo;
})());
ok('work, driving, screens and family are recordable with nothing to promote to',
  ['work', 'driving', 'screens', 'family']
    .every((id) => metrics.impactChip(id) && !metrics.impactChip(id).promotesTo));
ok('old web-app chip ids survived the merge',
  ['sleep', 'stress', 'work', 'sitting', 'activity', 'weather', 'food', 'meds',
    'driving', 'screens', 'family', 'rest']
    .every((id) => metrics.IMPACT_IDS.indexOf(id) >= 0));

ok('a list answer round-trips', (() => {
  const c = model.cleanCtx(ctxOf({ [WORSE]: listAns(['sleep', 'stress']) }));
  return c && c.a[WORSE].values.length === 2;
})());
ok('an EMPTY list is an answer, not an absence', (() => {
  const c = model.cleanCtx(ctxOf({ [WORSE]: listAns([]) }));
  return c && c.a[WORSE] && c.a[WORSE].values.length === 0
    && model.valuesOf({ ctx: c }, WORSE) !== null;
})());
ok('never asked reads as null, distinct from an empty answer',
  model.valuesOf({ pain: 5, cap: null, note: '' }, WORSE) === null);
ok('a skipped list is null too, but is stored as a skip', (() => {
  const c = model.cleanCtx(ctxOf({ [WORSE]: answer('', 540, { skipped: 1 }) }));
  return c && c.a[WORSE].skipped === 1 && model.valuesOf({ ctx: c }, WORSE) === null;
})());
ok('a chip id that is not in the vocabulary is dropped', (() => {
  const c = model.cleanCtx(ctxOf({ [WORSE]: listAns(['sleep', 'moonphase']) }));
  return c.a[WORSE].values.length === 1 && c.a[WORSE].values[0] === 'sleep';
})());

group('from flags to a question');
const flagDays = (n, ids, side) => {
  const e = {};
  for (let i = 1; i <= n; i++) {
    const d = '2026-08-' + String(i).padStart(2, '0');
    e[d] = {
      pain: 5, cap: null, note: '', logs: [{ h: 9 * M, pain: 5 }],
      ctx: ctxOf({ [side]: listAns(ids) }),
    };
  }
  return e;
};

ok('five flags is not yet an offer',
  protocol.promotionCandidate(flagDays(5, ['sleep'], WORSE), '2026-08-14', []) === null);
ok('six is', (() => {
  const p = protocol.promotionCandidate(flagDays(6, ['sleep'], WORSE), '2026-08-14', []);
  return p !== null && p.chipId === 'sleep' && p.metricId === 'sleep.quality.v1' && p.flags === 6;
})());
ok('flags on the helping side count too', (() => {
  const p = protocol.promotionCandidate(flagDays(7, ['rest'], BETTER), '2026-08-14', []);
  return p !== null && p.chipId === 'rest' && p.side === 'better';
})());
ok('a chip with nothing to measure it is never offered', (() => {
  return protocol.promotionCandidate(flagDays(12, ['work'], WORSE), '2026-08-14', []) === null;
})());
ok('MEDICATION is never offered, however often it is flagged',
  protocol.promotionCandidate(flagDays(20, ['meds'], WORSE), '2026-08-14', []) === null);
ok('something already being asked about is not offered again', (() => {
  const e = flagDays(10, ['sleep'], WORSE);
  return protocol.promotionCandidate(e, '2026-08-14', ['sleep.quality.v1']) === null;
})());
ok('the strongest candidate wins', (() => {
  const e = flagDays(6, ['stress'], WORSE);
  Object.keys(e).forEach((k, i) => {
    if (i < 9) e[k].ctx = ctxOf({ [WORSE]: listAns(['stress', 'weather']) });
  });
  // weather appears on the same days, so both are 6 — ties keep the first seen
  const p = protocol.promotionCandidate(e, '2026-08-14', []);
  return p !== null && p.flags === 6;
})());
ok('flags older than the window stop counting', (() => {
  const e = flagDays(10, ['sleep'], WORSE);   // 1–10 August
  return protocol.promotionCandidate(e, '2026-10-01', []) === null;
})());
ok('the offer sentence counts what you thought, and claims nothing about pain', (() => {
  const p = protocol.promotionCandidate(flagDays(8, ['sleep'], WORSE), '2026-08-14', []);
  const s = protocol.promotionSentence(p);
  return !/pain|worse|higher|caused|because/i.test(s) && s.indexOf('8 days') >= 0;
})(), protocol.promotionSentence(
  protocol.promotionCandidate(flagDays(8, ['sleep'], WORSE), '2026-08-14', [])
));

group('flags in the record');
ok('the report counts them per side, and never mixes them', (() => {
  const e = flagDays(9, ['sleep', 'stress'], WORSE);
  Object.keys(e).forEach((k) => {
    e[k].ctx = ctxOf({ [WORSE]: listAns(['sleep', 'stress']), [BETTER]: listAns(['rest']) });
  });
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-09', windowDays: 90,
  });
  return data.flagged.worse.length === 2 && data.flagged.worse[0].days === 9
    && data.flagged.better.length === 1 && data.flagged.better[0].id === 'rest';
})());
ok('the PDF prints them as self-attributed, with the reason they are not evidence', (() => {
  const e = flagDays(9, ['sleep'], WORSE);
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-09', windowDays: 90,
  });
  const html = report.reportHtml(data);
  return html.indexOf('What the patient points to') > 0
    && /Self-attributed/.test(html)
    && /no unaffected group/.test(html);
})());
ok('a record with no chips prints no such section', (() => {
  const e = {
    '2026-08-01': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] },
  };
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-01', windowDays: 90,
  });
  return data.flagged.worse.length === 0
    && report.reportHtml(data).indexOf('What the patient points to') < 0;
})());

/* ── what the widget is given ───────────────────────────────── */
group('the widget snapshot');

const widget = require(path.join(OUT, 'widget.js'));
const EMPTY_FILL = widget.WIDGET_EMPTY;

ok('seven days, oldest first', (() => {
  const e = {};
  for (let i = 1; i <= 10; i++) {
    e['2026-08-' + String(i).padStart(2, '0')] = {
      pain: i, cap: null, note: '', logs: [{ h: 540, pain: Math.min(10, i) }],
    };
  }
  const c = widget.weekColors(e, '2026-08-10');
  return c.length === 7 && c[6] !== c[0];
})());
ok('a day with nothing logged is an outline, not a colour', (() => {
  const c = widget.weekColors({}, '2026-08-10');
  return c.length === 7 && c.every((x) => x === EMPTY_FILL);
})());
ok('a gap in the middle stays a gap', (() => {
  const e = {
    '2026-08-08': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] },
    '2026-08-10': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] },
  };
  const c = widget.weekColors(e, '2026-08-10');
  return c[5] === EMPTY_FILL && c[4] !== EMPTY_FILL && c[6] !== EMPTY_FILL;
})());
ok('the caption states, and never nudges', (() => {
  const none = widget.weekCaption({}, '2026-08-10');
  const some = widget.weekCaption({
    '2026-08-10': { pain: 4, cap: null, note: '', logs: [{ h: 540, pain: 4 }] },
  }, '2026-08-10');
  return none === 'Check in' && some === 'Checked in today'
    && !/haven|forgot|don.t|missed|streak/i.test(none + ' ' + some);
})());
ok('the snapshot carries what the user entered — and nothing derived', (() => {
  /* The rule the widget is held to, and the line it draws. Today's own
     number may travel: it is what the user typed, said back to them.
     An AVERAGE may not — a rolling figure moves on its own as an old day
     leaves the window, which on a surface nobody can dismiss reads as
     progress that was never made. Notes never travel at all. */
  const e = {
    '2026-08-08': { pain: 2, cap: null, note: '', logs: [{ h: 540, pain: 2 }] },
    '2026-08-10': {
      pain: 9, cap: null, note: 'agony',
      logs: [{ h: 540, pain: 4 }, { h: 1140, pain: 9 }],
    },
  };
  const s = widget.widgetSnapshot(e, '2026-08-10');
  const blob = JSON.stringify(s);
  return s.last === '9'                       // today's LATEST, not its peak-by-luck
    && s.at === '19:00'
    && s.word === scale.painLabel(9)
    && s.tint === scale.painColor(9)
    && blob.indexOf('agony') < 0
    && !/avg|average|mean|trend|streak/i.test(blob);
})());
ok('a day with no check-in sends no number at all', (() => {
  /* yesterday's value on today's home screen would be read as today's,
     and a widget quietly showing the wrong day is worse than a blank one */
  const e = {
    '2026-08-09': { pain: 7, cap: null, note: '', logs: [{ h: 540, pain: 7 }] },
  };
  const s = widget.widgetSnapshot(e, '2026-08-10');
  return s.last === '' && s.word === '' && s.at === ''
    && s.tint === EMPTY_FILL && s.caption === 'Check in';
})());
ok('the seven letters are the seven days, today last', (() => {
  /* 2026-08-10 is a Monday, so the week reads Tue…Mon */
  const w = widget.weekLetters('2026-08-10');
  return w.length === 7 && w.join('') === 'TWTFSSM';
})());
ok('the colours come from the one pain ramp, not a second one', (() => {
  const e = {
    '2026-08-10': { pain: 7, cap: null, note: '', logs: [{ h: 540, pain: 7 }] },
  };
  return widget.weekColors(e, '2026-08-10')[6] === scale.painColor(7);
})());

/* ── a moment from the watch's clock ─────────────────────────
   The watch sends WHEN it was, as epoch + the offset in force there;
   the record stores a local date and minute. The arithmetic must not
   depend on the phone's own zone — the tz travels with the check-in. */
group('a moment from an epoch');

ok('an instant lands at its own wall clock', (() => {
  // 2026-08-30 06:30 UTC at +03:00 is 09:30 local
  const at = model.momentFromEpoch(Date.UTC(2026, 7, 30, 6, 30), 180);
  return at && at.date === '2026-08-30' && at.h === 9 * 60 + 30;
})());
ok('a negative offset works the same way', (() => {
  // 2026-08-30 06:30 UTC at -04:00 is 02:30 local, same date
  const at = model.momentFromEpoch(Date.UTC(2026, 7, 30, 6, 30), -240);
  return at && at.date === '2026-08-30' && at.h === 2 * 60 + 30;
})());
ok('the date is the LOCAL date, either side of midnight', (() => {
  // 22:30 UTC at +03:00 is already tomorrow; 01:30 UTC at -04:00 is still yesterday
  const fwd = model.momentFromEpoch(Date.UTC(2026, 7, 30, 22, 30), 180);
  const back = model.momentFromEpoch(Date.UTC(2026, 7, 30, 1, 30), -240);
  return fwd && fwd.date === '2026-08-31' && fwd.h === 90
    && back && back.date === '2026-08-29' && back.h === 21 * 60 + 30;
})());
ok('a dead-battery clock is refused, not recorded', (() => {
  // a watch that reset to the epoch must not create a 1970 day
  return model.momentFromEpoch(0, 180) === null
    && model.momentFromEpoch(Date.UTC(2026, 7, 30), 99999) === null
    && model.momentFromEpoch('soon', 180) === null
    && model.momentFromEpoch(NaN, 180) === null;
})());

/* ── a check-in added after the fact ─────────────────────────
   A retrospective entry carries no flag; being recalled is DERIVED
   from the capture stamps every moment already has. Written on a later
   day than it describes = added later, forever, through any backup. */
group('added later');

ok('written the same day it describes is not "added later"', (() => {
  // captured 2026-08-30 14:00 UTC at +03:00 → local 2026-08-30
  const m = { h: 540, pain: 4, ts: Date.UTC(2026, 7, 30, 14, 0), tz: 180 };
  return model.momentAddedLater('2026-08-30', m) === false;
})());
ok('written the day after is', (() => {
  const m = { h: 540, pain: 4, ts: Date.UTC(2026, 7, 31, 14, 0), tz: 180 };
  return model.momentAddedLater('2026-08-30', m) === true;
})());
ok('the local date decides, not UTC', (() => {
  // 22:30 UTC on the 30th at +03:00 is already the 31st where the user is
  const m = { h: 540, pain: 4, ts: Date.UTC(2026, 7, 30, 22, 30), tz: 180 };
  return model.momentAddedLater('2026-08-30', m) === true;
})());
ok('no stamps means no claim — unknown is not evidence of recall', (() => {
  return model.momentAddedLater('2026-08-30', { h: 540, pain: 4 }) === false
    && model.momentAddedLater('2026-08-30', { h: 540, pain: 4, ts: 0, tz: 180 }) === false;
})());
ok('the retro window is a fortnight and lives in thresholds', (() => {
  return th.RETRO_CHECKIN_MAX_DAYS === 14;
})());

/* ── the background ──────────────────────────────────────────
   Page one of a pain history, in the patient's words. Free text, each
   field capped, none of it ever read by an engine — a static fact has
   an n of 1 and no comparison group. */
group('the background');

ok('fields trim, cap, and junk drops', (() => {
  const b = model.cleanBackground({
    v: 1,
    medications: '  naproxen 500mg  ',
    diagnoses: 'x'.repeat(400),
    bloodType: 'A+',          // never asked for, never stored
    body: 42,                  // not a string, not kept
  });
  return b && b.medications === 'naproxen 500mg'
    && b.diagnoses.length === model.BACKGROUND_FIELD_MAX
    && !('bloodType' in b) && !('body' in b);
})());
ok('a sheet of empty fields is no background at all', (() => {
  return model.cleanBackground({ v: 1, body: '  ', family: '' }) === null
    && model.cleanBackground('words') === null
    && model.cleanBackground(null) === null;
})());
ok('the backup carries it, and an old backup reads as none', (() => {
  const withBg = model.validateBackup(JSON.stringify({
    version: 6, entries: {}, background: { v: 1, allergies: 'penicillin' },
  }));
  const old = model.validateBackup(JSON.stringify({ version: 5, entries: {} }));
  return withBg && withBg.background && withBg.background.allergies === 'penicillin'
    && old && old.background === null;
})());
ok('the report prints it first, and only what was written', (() => {
  const [e] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  const last = Object.keys(e).sort().pop();
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: last, windowDays: 90,
    background: { v: 1, medications: 'naproxen 500mg', allergies: 'penicillin' },
  });
  const html = report.reportHtml(data);
  const bgAt = html.indexOf('Background');
  const metricsAt = html.indexOf('Key metrics');
  return data.background.medications === 'naproxen 500mg'
    && bgAt >= 0 && metricsAt >= 0 && bgAt < metricsAt
    && html.indexOf('naproxen 500mg') >= 0
    && html.indexOf('Family history') < 0;    // unwritten fields stay unprinted
})());
ok('without a background the report has no such section', (() => {
  const [e] = record(30, (i) => (i < 10 ? 2 : i < 20 ? 5 : 9), () => 'hands');
  const last = Object.keys(e).sort().pop();
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: last, windowDays: 90,
  });
  return data.background === null
    && report.reportHtml(data).indexOf('<h2>Background</h2>') < 0;
})());

/* ── the guided note ────────────────────────────────────────── */
group('the guided note');

const flare = (extra) => Object.assign(
  { date: '2026-08-10', h: 9 * M, kind: 'flare', text: '' }, extra || {}
);

ok('the two missing SOCRATES answers round-trip', (() => {
  const ev = model.cleanEvent(flare({
    onset: 'sudden', doing: 'carrying shopping', spread: 'down my left leg',
    duration: 'hours',
  }));
  return ev.onset === 'sudden' && ev.doing === 'carrying shopping'
    && ev.spread === 'down my left leg' && ev.duration === 'hours';
})());
ok('an invented onset is dropped rather than stored',
  model.cleanEvent(flare({ onset: 'exploded' })).onset === undefined);
ok('an invented duration is dropped',
  model.cleanEvent(flare({ duration: 'a fortnight' })).duration === undefined);
ok('whitespace is not an answer', (() => {
  const ev = model.cleanEvent(flare({ spread: '   ', doing: '' }));
  return ev.spread === undefined && ev.doing === undefined;
})());
ok('a flare with nothing but a time is still a flare', (() => {
  const ev = model.cleanEvent(flare({}));
  return ev !== null && ev.onset === undefined && ev.duration === undefined;
})());
ok('unanswered stays absent — never an empty string', (() => {
  const ev = model.cleanEvent(flare({ onset: 'gradual' }));
  return ev.onset === 'gradual' && !('spread' in ev) && !('doing' in ev);
})());
ok('two flares differing only in onset are different events', (() => {
  const a = flare({ onset: 'sudden' });
  const b = flare({ onset: 'gradual' });
  return model.eventKey(a) !== model.eventKey(b);
})());
ok('the labels read as things a person would say', (() => {
  return model.ONSET_LABELS.sudden === 'Came on suddenly'
    && model.DURATION_LABELS.mostDay === 'Most of the day'
    && model.ONSETS.length === 3 && model.DURATIONS.length === 4;
})());
ok('a v5 backup carries the guided answers', (() => {
  const b = model.validateBackup(JSON.stringify({
    version: 5, entries: {},
    events: [flare({ onset: 'sudden', spread: 'left arm', duration: 'minutes' })],
  }));
  const ev = b.events[0];
  return ev.onset === 'sudden' && ev.spread === 'left arm' && ev.duration === 'minutes';
})());
ok('the PDF prints onset and radiation beside the event', (() => {
  const e = {
    '2026-08-10': { pain: 8, cap: null, note: '', logs: [{ h: 9 * M, pain: 8 }] },
  };
  const data = report.buildReportData({
    entries: e,
    events: [flare({
      id: 1, onset: 'sudden', doing: 'lifting a box',
      spread: 'down the back of my leg', duration: 'hours',
    })],
    func: [], goalText: null, todayIso: '2026-08-10', windowDays: 90,
  });
  const html = report.reportHtml(data);
  return html.indexOf('Came on suddenly') > 0
    && html.indexOf('lifting a box') > 0
    && html.indexOf('down the back of my leg') > 0
    && html.indexOf('A few hours') > 0;
})());
ok('an event nobody described prints no empty detail line', (() => {
  const e = {
    '2026-08-10': { pain: 8, cap: null, note: '', logs: [{ h: 9 * M, pain: 8 }] },
  };
  const data = report.buildReportData({
    entries: e, events: [flare({ id: 1, text: 'bad one' })],
    func: [], goalText: null, todayIso: '2026-08-10', windowDays: 90,
  });
  const html = report.reportHtml(data);
  return html.indexOf('bad one') > 0 && html.indexOf('doing:') < 0
    && html.indexOf('spread:') < 0 && html.indexOf('lasted:') < 0;
})());


/* ── the free-text note ─────────────────────────────────────
   cleanAnswer rebuilds every answer from a whitelist, so a field it does
   not know about is dropped on the way back out of SQLite — silently, on
   read, long after the user typed it. That is the failure this group
   exists to catch, and the reason it also checks the skip path and the
   fact that the ENGINE still cannot see the text. */
group('the note in your own words');
ok('a note survives the sanitiser', (() => {
  const c = model.cleanCtx(ctxOf({
    'recovery.practice.v1': answer('focused', 1140, { note: '20 min walk, heat pad' }),
  }));
  return c && c.a['recovery.practice.v1'].note === '20 min walk, heat pad';
})());
ok('a note survives on a skipped answer too', (() => {
  const c = model.cleanCtx(ctxOf({
    'recovery.practice.v1': answer('', 1140, { skipped: 1, note: 'stretched, could not grade it' }),
  }));
  const a = c && c.a['recovery.practice.v1'];
  return a && a.skipped === 1 && a.note === 'stretched, could not grade it';
})());
ok('a note is trimmed and capped, never a reason to lose the answer', (() => {
  const c = model.cleanCtx(ctxOf({
    'recovery.practice.v1': answer('some', 1140, { note: '  ' + 'x'.repeat(400) + '  ' }),
  }));
  const a = c && c.a['recovery.practice.v1'];
  return a && a.value === 'some' && a.note.length === 280;
})());
ok('whitespace alone is not a note', (() => {
  const c = model.cleanCtx(ctxOf({
    'recovery.practice.v1': answer('some', 1140, { note: '   ' }),
  }));
  return c && c.a['recovery.practice.v1'].note === undefined;
})());
ok('a non-string note is dropped, not stored', (() => {
  const c = model.cleanCtx(ctxOf({
    'recovery.practice.v1': answer('some', 1140, { note: { evil: 1 } }),
  }));
  return c && c.a['recovery.practice.v1'].note === undefined;
})());
ok('the engine still sees only the level', (() => {
  const day = {
    pain: 5, cap: null, note: '',
    ctx: ctxOf({ 'recovery.practice.v1': answer('focused', 1140, { note: 'a long walk' }) }),
  };
  return model.valueOf(day, 'recovery.practice.v1') === 'focused';
})());
ok('every level of every asked metric fits a stacked row', (() => {
  /* the bug was a three-across segmented control abbreviating "A focused
     effort" into "A focuse…". Stacked rows cannot truncate, but a level
     long enough to wrap past two lines would still be a wording problem
     rather than a layout one — so the vocabulary is held to a length a
     phone row can show. */
  return metrics.METRICS.every((m) =>
    !m.levels || m.levels.every((l) => l.label.length <= 22));
})());

/* ── the bands anything groups days by ──────────────────────
   Trends counts logged days into bands by asking painLabel for each
   representative score and matching that word. The failure that buys is
   silent: a band whose word no longer matches matches NOTHING, its days
   leave the chart, and the total is quietly short with no error anywhere.
   These assertions are what make that a broken build instead. */
group('the bands the charts group by');
ok('five representatives, one per band', scale.BAND_AT.length === 5);
ok('every score 0-10 falls in exactly one band', (() => {
  const words = scale.BAND_AT.map((at) => scale.painLabel(at));
  if (new Set(words).size !== words.length) return false;    // no two the same
  for (let v = 0; v <= 10; v++) {
    if (words.indexOf(scale.painLabel(v)) < 0) return false;  // none orphaned
  }
  return true;
})());
ok('the representatives are ordered easiest to hardest',
  scale.BAND_AT.every((v, i) => i === 0 || v > scale.BAND_AT[i - 1]));
ok('a fractional daily average still lands in a band', (() => {
  const words = scale.BAND_AT.map((at) => scale.painLabel(at));
  return [0.4, 3.4, 4.5, 6.6, 9.5].every((v) => words.indexOf(scale.painLabel(v)) >= 0);
})());

/* ── what the watch is given ────────────────────────────────
   The watch draws the square in whatever colour the phone tells it a
   score wears; it holds no ramp of its own. So this is the ONE place
   the ramp is asserted to reach the wrist intact: eleven fills, eleven
   inks and eleven words, each the value painScale would give the same
   score on the phone — and the theme the user picked, not the default. */
group('the watch context');

const wctx = require(path.join(OUT, 'watchContext.js'));

ok('one entry per whole score, 0 through 10', (() => {
  const c = wctx.watchContext();
  return c.ramp.length === 11 && c.ink.length === 11 && c.words.length === 11;
})());
ok('each fill is exactly painColor for that score', (() => {
  const c = wctx.watchContext();
  return c.ramp.every((hex, i) => hex === scale.painColor(i));
})());
ok('each ink is what inkOn would pick for that score', (() => {
  const c = wctx.watchContext();
  return c.ink.every((hex, i) => hex === scale.inkOn(i));
})());
ok('each word is painLabel for that score — one vocabulary', (() => {
  const c = wctx.watchContext();
  return c.words.every((w, i) => w === scale.painLabel(i));
})());
ok('every colour is a #RRGGBB the watch can parse', (() => {
  const c = wctx.watchContext();
  return c.ramp.concat(c.ink).every((h) => /^#[0-9A-F]{6}$/.test(h));
})());
ok('it is versioned, so an older watch can refuse a newer shape',
  wctx.watchContext().v === 1 && wctx.WATCH_CONTEXT_VERSION === 1);
ok('the theme rides along and the fills follow it', (() => {
  const before = scale.getPainTheme();
  try {
    scale.setPainTheme('violet');
    const c = wctx.watchContext();
    return c.theme === 'violet' && c.ramp[5] === scale.painColor(5, 'violet')
      && c.ramp[5] !== scale.painColor(5, 'blue');
  } finally { scale.setPainTheme(before); }
})());

/* ── the patient's own question, and the periods, in the PDF ── */
group('the report carries the patient\'s question');
ok('the hypothesis prints verbatim, after the background and before the numbers', (() => {
  const e = {};
  for (let i = 1; i <= 10; i++) {
    e['2026-08-' + String(i).padStart(2, '0')] = {
      pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }],
    };
  }
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-10', windowDays: 90,
    background: { v: 1, diagnoses: 'fibromyalgia' },
    hypothesis: { id: 1, createdOn: '2026-08-01', understand: 'why <mornings> are worse', harder: 'stress', helps: '' },
    protocols: [{
      id: 1, version: 1, startDate: '2026-08-03', endDate: null, reviewOn: '2026-08-16',
      chosenFactor: 'stress.level.v1', secondFactor: 'load.physical.v1',
      hypothesisId: 1, status: 'active',
    }],
  });
  const html = report.reportHtml(data);
  const bg = html.indexOf('<h2>Background</h2>');
  const q = html.indexOf('What the patient wants to understand');
  const periods = html.indexOf('Observation periods');
  const metrics = html.indexOf('Key metrics');
  return data.hypothesis && data.hypothesis.understand === 'why <mornings> are worse'
    && html.indexOf('why &lt;mornings&gt; are worse') > 0      // verbatim, escaped
    && html.indexOf('Thinks helps') < 0                        // an empty answer prints no row
    && bg < q && q < periods && periods < metrics
    && data.periods.length === 1 && data.periods[0].to === null
    && html.indexOf('Stress · Physical load') > 0 && html.indexOf('still running') > 0;
})());
ok('no hypothesis and no period print no such sections', (() => {
  const e = { '2026-08-01': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] } };
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-01', windowDays: 90,
    hypothesis: { id: 1, createdOn: '2026-08-01', understand: '  ', harder: '', helps: '' },
    protocols: [],
  });
  const html = report.reportHtml(data);
  return data.hypothesis === null && data.periods.length === 0
    && html.indexOf('What the patient wants to understand') < 0
    && html.indexOf('Observation periods') < 0;
})());
ok('a period that ended before the window stays out of it', (() => {
  const e = { '2026-08-20': { pain: 5, cap: null, note: '', logs: [{ h: 540, pain: 5 }] } };
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-20', windowDays: 7,
    protocols: [{
      id: 1, version: 1, startDate: '2026-07-01', endDate: '2026-07-14', reviewOn: '2026-07-14',
      chosenFactor: 'stress.level.v1', secondFactor: 'load.physical.v1',
      hypothesisId: null, status: 'completed',
    }],
  });
  return data.periods.length === 0;
})());
ok('SOCRATES: site, timing and character come before the descriptive ends', (() => {
  const e = {};
  for (let i = 1; i <= 30; i++) {
    e['2026-08-' + String(Math.min(31, i)).padStart(2, '0')] = {
      pain: 5, cap: null, note: '',
      logs: [{ h: 540, pain: i < 10 ? 2 : i < 20 ? 5 : 9, loc: ['hands'], q: ['aching'] },
        { h: 1200, pain: i < 10 ? 2 : i < 20 ? 5 : 9 }],
    };
  }
  const data = report.buildReportData({
    entries: e, events: [], func: [], goalText: null,
    todayIso: '2026-08-30', windowDays: 90,
  });
  const html = report.reportHtml(data);
  const at = (t) => html.indexOf('<h2>' + t + '</h2>');
  return at('Pain over time') < at('Pain locations')
    && at('Pain locations') < at('Time of day')
    && at('Time of day') < at('Described as')
    && at('Described as') < at('Hardest and easiest days');
})());

/* ── the widget timeline: today, and the first minute of tomorrow ── */
group('the widget timeline');
ok('two entries: now, and midnight tomorrow with today\'s number gone', (() => {
  const e = {
    '2026-08-10': { pain: 6, cap: null, note: '', logs: [{ h: 900, pain: 6 }] },
  };
  const now = new Date(2026, 7, 10, 15, 0);
  const list = widget.widgetEntries(e, '2026-08-10', now);
  const [today, tomorrow] = list;
  return list.length === 2
    && today.at === now && today.props.last === '6' && today.props.w6 === 'M'
    && tomorrow.dateIso === '2026-08-11'
    && tomorrow.at.getFullYear() === 2026 && tomorrow.at.getMonth() === 7
    && tomorrow.at.getDate() === 11 && tomorrow.at.getHours() === 0 && tomorrow.at.getMinutes() === 0
    && tomorrow.props.last === '' && tomorrow.props.at === ''
    && tomorrow.props.w6 === 'T'                 // the strip has moved a day
    && tomorrow.props.d5 === today.props.d6;    // today's colour is yesterday's square by then
})());

/* ── the impact chips ask in the evening ────────────────────── */
group('the impact chips ask in the evening');
ok('not at the morning\'s first check-in', (() => {
  const rule = metrics.getMetric(metrics.IMPACT_WORSE).eligibility;
  return rule === 'firstAfter1700'
    && metrics.eligibleNow(rule, 8 * 60, true, false) === false;
})());
ok('at the first check-in from 17:00, once', (() => {
  const rule = metrics.getMetric(metrics.IMPACT_WORSE).eligibility;
  return metrics.eligibleNow(rule, 19 * 60, false, false) === true
    && metrics.eligibleNow(rule, 21 * 60, false, true) === false;
})());

/* ── the chart's grain: days, then weeks ────────────────────── */
group('the chart\'s grain');
ok('under the threshold, one column per day, today last', (() => {
  const days = [
    { date: '2026-08-01', avg: 2, count: 1 },
    { date: '2026-08-03', avg: 6, count: 1 },
  ];
  const cols = report.chartColumns(days, '2026-08-03', 7);
  return report.chartGrain(7) === 'day' && cols.length === 7
    && cols[6].from === '2026-08-03' && cols[6].to === '2026-08-03' && cols[6].avg === 6
    && cols[5].avg === null && cols[4].avg === 2 && cols[0].from === '2026-07-28';
})());
ok('over the threshold, a column is a week ending today, averaging only its logged days', (() => {
  const days = [];
  for (let i = 0; i < 90; i++) {
    const d = new Date(2026, 5, 3); d.setDate(d.getDate() + i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (i % 3 === 0) days.push({ date: k, avg: i < 45 ? 3 : 7, count: 1 });
  }
  const cols = report.chartColumns(days, '2026-08-31', 90);
  const last = cols[cols.length - 1];
  const first = cols[0];
  return report.chartGrain(90) === 'week'
    && cols.length === 13                                  // 90 days: twelve whole weeks and a stub
    && last.to === '2026-08-31' && last.from === '2026-08-25'
    && last.logged >= 2 && last.avg === 7
    && first.from === '2026-06-03' && first.to === '2026-06-08'   // the six-day stub is the OLDEST column
    && cols.every((c) => c.avg === null || (c.avg >= 3 && c.avg <= 7))
    && cols.every((c) => (c.avg == null) === (c.openDate == null));
})());
ok('a week with nothing logged is a gap, not a zero', (() => {
  const days = [{ date: '2026-08-31', avg: 4, count: 1 }];
  const cols = report.chartColumns(days, '2026-08-31', 70);
  return cols[cols.length - 1].avg === 4 && cols.slice(0, -1).every((c) => c.avg === null);
})());
ok('the threshold is named, and sixty', th.CHART_WEEKLY_ABOVE_DAYS === 60);

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
