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
const th = require(path.join(OUT, 'thresholds.js'));
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
group('backup v1 → v5');
ok('the version moved to 5', model.BACKUP_VERSION === 5);
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

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
