/**
 * Medicines Pattern keeps (meds.ts) and the card that reads what helps
 * (helps.ts) — pure domain against fixtures.
 *
 *   node tools/test-meds.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const meds = require(path.join(OUT, 'meds.js'));
const helps = require(path.join(OUT, 'helps.js'));
const doses = require(path.join(OUT, 'health', 'doses.js'));
const model = require(path.join(OUT, 'model.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);
const day = (n) => '2026-09-' + String(n).padStart(2, '0');

const IBU = { id: 1, name: 'Ibuprofen', dose: '200 mg', times: [8 * 60, 20 * 60], remind: true };
const PRN = { id: 2, name: 'Paracetamol', dose: '', times: [], remind: false };

group('the list');
ok('a medicine is cleaned: trimmed, capped, times sorted, deduped, at most four', (() => {
  const m = meds.cleanMedication({
    id: 3, name: '  ' + 'x'.repeat(99), dose: ' one tablet ', times: [600, 480, 480, 1500, 60, 900, 1200], remind: true, junk: 1,
  });
  return m.name.length === meds.MED_NAME_MAX && m.dose === 'one tablet'
    && JSON.stringify(m.times) === JSON.stringify([60, 480, 600, 900]) && !('junk' in m);
})());
ok('no name, no id: no medicine', meds.cleanMedication({ id: 1, name: ' ' }) === null
  && meds.cleanMedication({ name: 'x' }) === null);
ok('remind is only ever true when it was said', meds.cleanMedication({ id: 1, name: 'x', remind: 'yes' }).remind === false);
ok('the list keeps eight, unique by id', (() => {
  const raw = []; for (let i = 0; i < 12; i++) raw.push({ id: i % 10, name: 'm' + i });
  const l = meds.cleanMedications(raw);
  return l.length === meds.MEDS_MAX && new Set(l.map((m) => m.id)).size === l.length;
})());

group('the log: three states');
ok('a scheduled time answered twice keeps the later answer', (() => {
  let l = meds.withLog([], { medId: 1, date: day(1), slot: 480, h: 485, status: 'skipped' });
  l = meds.withLog(l, { medId: 1, date: day(1), slot: 480, h: 600, status: 'taken' });
  return l.length === 1 && l[0].status === 'taken';
})());
ok('as-needed doses are each their own', (() => {
  let l = meds.withLog([], { medId: 2, date: day(1), slot: -1, h: 600, status: 'taken' });
  l = meds.withLog(l, { medId: 2, date: day(1), slot: -1, h: 900, status: 'taken' });
  return l.length === 2;
})());
ok('undo returns a time to not said', (() => {
  const l = meds.withLog([], { medId: 1, date: day(1), slot: 480, h: 485, status: 'taken' });
  return meds.withoutLog(l, 1, day(1), 480).length === 0;
})());
ok('a bad log row is dropped, never repaired', meds.cleanDoseLog({ medId: 1, date: 'today', slot: 480, h: 1, status: 'taken' }) === null
  && meds.cleanDoseLog({ medId: 1, date: day(1), slot: 480, h: 1, status: 'maybe' }) === null
  && meds.cleanDoseLog({ medId: 1, date: day(1), slot: 5000, h: 1, status: 'taken' }) === null);
ok('merge keeps this phone’s answer for a time and adds the rest', (() => {
  const have = [{ medId: 1, date: day(1), slot: 480, h: 485, status: 'taken' }];
  const inc = [{ medId: 1, date: day(1), slot: 480, h: 490, status: 'skipped' },
    { medId: 1, date: day(2), slot: 480, h: 490, status: 'skipped' }];
  const m = meds.mergeDoseLogs(have, inc);
  return m.length === 2 && m[0].status === 'taken' && m[1].date === day(2);
})());

group('what is due on Today');
ok('due once its time has come, until answered or six hours on', (() => {
  const at = (now, logs) => meds.dueDoses([IBU], logs || [], day(1), now).map((d) => d.slot);
  return JSON.stringify(at(7 * 60)) === '[]'
    && JSON.stringify(at(8 * 60)) === '[480]'
    && JSON.stringify(at(8 * 60 + th.MED_DUE_WINDOW_MIN + 1)) === '[]'
    && JSON.stringify(at(9 * 60, [{ medId: 1, date: day(1), slot: 480, h: 500, status: 'skipped' }])) === '[]'
    && JSON.stringify(at(21 * 60)) === '[1200]';
})());
ok('yesterday’s unanswered dose is never asked about today', (() => {
  const d = meds.dueDoses([IBU], [], day(2), 7 * 60);
  return d.length === 0;
})());
ok('as-needed medicines are never due', meds.dueDoses([PRN], [], day(1), 12 * 60).length === 0);

group('doses beside pain');
function e(logs) { return { pain: logs[0][1], cap: null, note: '', logs: logs.map(([h, pain]) => ({ h, pain })) }; }
ok('a logged dose pairs with the check-ins around it, like a Health dose', (() => {
  const E = { [day(1)]: e([[470, 6], [600, 3]]) };
  const H = meds.withAppDoses({}, [IBU], [{ medId: 1, date: day(1), slot: 480, h: 480, status: 'taken' }]);
  const p = doses.dosePairs(E, H);
  return p.length === 1 && p[0].before === 6 && p[0].after === 3 && p[0].med === 'Ibuprofen'
    && p[0].medId === meds.appMedId(1);
})());
ok('a bare day made for a dose has no coverage, so nothing else reads it', (() => {
  const H = meds.withAppDoses({}, [IBU], [{ medId: 1, date: day(1), slot: 480, h: 480, status: 'taken' }]);
  return Object.keys(H[day(1)].coverage).length === 0;
})());
ok('a skipped dose is kept but never an exposure', (() => {
  const E = { [day(1)]: e([[470, 6], [600, 3]]) };
  const H = meds.withAppDoses({}, [IBU], [{ medId: 1, date: day(1), slot: 480, h: 480, status: 'skipped' }]);
  return H[day(1)].doses.length === 1 && doses.dosePairs(E, H).length === 0;
})());
ok('the same dose in Health and in Pattern counts once', (() => {
  const health = { [day(1)]: { date: day(1), coverage: { medications: true },
    doses: [{ h: 470, medId: 'hk-1', med: 'ibuprofen', status: 'taken' }] } };
  const H = meds.withAppDoses(health, [IBU], [{ medId: 1, date: day(1), slot: 480, h: 500, status: 'taken' }]);
  return H[day(1)].doses.length === 1 && health[day(1)].doses.length === 1;
})());
ok('a removed medicine’s doses stay logged and leave the comparison', (() => {
  const H = meds.withAppDoses({}, [], [{ medId: 1, date: day(1), slot: 480, h: 480, status: 'taken' }]);
  return !H[day(1)];
})());

group('the backup');
ok('medicines and doses round-trip, and an old file has none', (() => {
  const file = JSON.stringify({
    app: 'pattern', version: model.BACKUP_VERSION, entries: {}, events: [],
    medications: [IBU, { id: 'x' }], doseLogs: [{ medId: 1, date: day(1), slot: 480, h: 485, status: 'taken' }, { bad: 1 }],
  });
  const v = model.validateBackup(file);
  const old = model.validateBackup(JSON.stringify({ app: 'pattern', version: 7, entries: {}, events: [] }));
  return v && v.medications.length === 1 && v.medications[0].name === 'Ibuprofen'
    && v.doseLogs.length === 1 && old && old.medications.length === 0 && old.doseLogs.length === 0;
})());

group('tiredness beside pain');
const F = 'fatigue.level.v1';
function tiredDay(pain, level) {
  const x = { pain, cap: null, note: '', logs: [{ h: 9 * 60, pain }] };
  if (level) {
    x.ctx = { v: 1, a: {} };
    x.ctx.a[F] = level === 'skip'
      ? { value: '', h: 9 * 60, ts: 0, tz: 0, qv: 1, pid: null, skipped: 1 }
      : { value: level, h: 9 * 60, ts: 0, tz: 0, qv: 1, pid: null };
  }
  return x;
}
ok('silent until five days each way', (() => {
  const E = {};
  for (let i = 1; i <= 4; i++) E[day(i)] = tiredDay(7, 'high');
  for (let i = 5; i <= 12; i++) E[day(i)] = tiredDay(3, 'low');
  return helps.tiredComparison(E, day(20)) === null;
})());
ok('five each way, and a skip is not a low', (() => {
  const E = {};
  for (let i = 1; i <= 5; i++) E[day(i)] = tiredDay(7, 'high');
  for (let i = 6; i <= 10; i++) E[day(i)] = tiredDay(3, 'low');
  for (let i = 11; i <= 15; i++) E[day(i)] = tiredDay(1, 'skip');
  const t = helps.tiredComparison(E, day(20));
  return t && t.high.n === 5 && t.low.n === 5 && t.delta === 4 && t.verdict === 'possible';
})());

group('the card');
function tiredRecord() {
  const E = {};
  for (let i = 1; i <= 5; i++) E[day(i)] = tiredDay(7, 'high');
  for (let i = 6; i <= 10; i++) E[day(i)] = tiredDay(3, 'low');
  return E;
}
ok('nothing yet: empty, and it says what it is waiting for', (() => {
  const v = helps.helpsView({ entries: {}, todayIso: day(20), experiment: null, past: [], health: [], doses: [], activity: [] });
  return v.empty && v.rows.length === 0 && helps.HELPS_EMPTY.length > 0;
})());
ok('rows sort by side: better, harder, compared, doing, same', (() => {
  const v = helps.helpsView({
    entries: tiredRecord(), todayIso: day(20), experiment: null, past: [],
    health: [], activity: [{ key: 'k', text: 'Easy walking is going well.', why: 'w', last: day(1), rank: 3 }],
    doses: [
      { medId: 'a', med: 'A', verdict: 'observation', pairs: 12, before: 5, after: 5, delta: 0 },
      { medId: 'b', med: 'B', verdict: 'possible', pairs: 12, before: 6, after: 4, delta: -2 },
    ],
  });
  const sides = v.rows.map((r) => r.side);
  return JSON.stringify(sides) === JSON.stringify(['better', 'harder', 'doing', 'same']);
})());
ok('every row carries what it rests on and what it is not', (() => {
  const v = helps.helpsView({
    entries: tiredRecord(), todayIso: day(20), experiment: null, past: [], health: [], activity: [],
    doses: [{ medId: 'b', med: 'B', verdict: 'possible', pairs: 12, before: 6, after: 4, delta: -2 }],
  });
  return v.rows.length === 2 && v.rows.every((r) => r.why && r.caveat);
})());
ok('no row, heading or note says a thing causes, cures, or should be done', (() => {
  const v = helps.helpsView({
    entries: tiredRecord(), todayIso: day(20), experiment: null, past: [], health: [], activity: [],
    doses: [{ medId: 'b', med: 'B', verdict: 'possible', pairs: 12, before: 6, after: 4, delta: -2 }],
  });
  const text = v.rows.map((r) => r.text + ' ' + r.why).join(' ') + ' '
    + Object.values(helps.SIDE_TITLES).join(' ') + ' ' + helps.HELPS_NOTE + ' ' + helps.HELPS_EMPTY;
  return !/\b(should|causes|caused by|cures|streak|you must|stop taking)\b/i.test(text);
})());
ok('the card shows four, and counts the rest', (() => {
  const d = [];
  for (let i = 0; i < 6; i++) d.push({ medId: 'm' + i, med: 'M' + i, verdict: 'possible', pairs: 12, before: 6, after: 4, delta: -2 });
  const v = helps.helpsView({ entries: {}, todayIso: day(20), experiment: null, past: [], health: [], activity: [], doses: d });
  return v.rows.length === 6 && v.more === 6 - th.HELPS_TODAY_MAX;
})());
ok('the same record read twice gives the same card', (() => {
  const input = { entries: tiredRecord(), todayIso: day(20), experiment: null, past: [], health: [], doses: [], activity: [] };
  return JSON.stringify(helps.helpsView(input)) === JSON.stringify(helps.helpsView(input));
})());

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
