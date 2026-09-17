/* Regression checks at the native service and persistence seams. No device claims. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const ROOT = path.join(__dirname, '..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));
const pure = (p) => require(path.join(ROOT, '.testbuild', p + '.js'));
const model = pure('model');
const norm = pure('health/normalize');
const windows = pure('health/windows');
const engine = pure('health/engine');
const mock = pure('health/mock');
const doses = pure('health/doses');
const report = pure('report');
const clock = {
  startOf: d => new Date(d + 'T00:00:00Z').getTime(),
  minutesOf: t => new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes(),
  dateOf: t => new Date(t).toISOString().slice(0, 10),
};
function loadTs(rel, overrides = {}) {
  const filename = path.join(ROOT, rel);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = { exports: {} };
  const req = name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('.')) {
      const full = path.resolve(path.dirname(filename), name);
      const compiled = full.replace(path.join(ROOT, 'src'), path.join(ROOT, '.testbuild')) + '.js';
      return require(compiled);
    }
    return require(require.resolve(name, { paths: [ROOT] }));
  };
  vm.runInThisContext('(function(require,module,exports){' + js + '\n})', { filename })(req, mod, mod.exports);
  return mod.exports;
}

function memoryDb() {
  const prefs = new Map([['health.categories', ['sleep']], ['health.requestedOn', '2026-09-01']]);
  const days = {};
  let marker = '2026-06-01', revision = 0, syncStatus = null;
  return {
    days,
    getPref: (k, fallback) => prefs.has(k) ? prefs.get(k) : fallback,
    setPref: (k, v) => prefs.set(k, v),
    getHealthRevision: () => revision,
    getHealthSyncStatus: () => syncStatus,
    setHealthSyncStatus: s => { syncStatus = s; },
    getHealthDays: () => ({ ...days }),
    getHealthDay: d => days[d] || null,
    putHealthDay: (d, v) => { days[d] = v; },
    removeHealthDay: d => { delete days[d]; },
    getHealthSyncedFrom: () => marker,
    setHealthSyncedFrom: v => { marker = v; },
    clearHealthSyncedFrom: () => { marker = null; syncStatus = null; revision++; },
    clearHealthDays: () => { for (const k of Object.keys(days)) delete days[k]; marker = null; syncStatus = null; revision++; },
    getDay: () => null,
  };
}
const today = model.todayISO();
const sample = d => ({ start: clock.startOf(d), end: clock.startOf(d), value: 250, source: 'test' });
const sleepBundle = d => ({ ...mock.emptyBundle(d), sleep: [{ start: clock.startOf(d) - 3600000,
  end: clock.startOf(d) + 7 * 3600000, stage: 'asleep', source: 'watch' }] });
const service = fetchDay => ({ available: () => true, fetchDay });
let passed = 0;
async function check(name, run) { await run(); passed++; console.log('PASS ' + name); }

async function main() {
  await check('missing alcohol cannot form a no-drinks comparison; explicit zero can', () => {
    const health = {}, entries = {};
    for (let i = 0; i < 24; i++) {
      const d = model.addDays('2026-08-01', i);
      const raw = { ...mock.emptyBundle(d), water: [sample(d)] };
      if (i % 2) raw.alcohol = [{ ...sample(d), value: 1 }];
      health[d] = norm.normalizeDay(raw, clock);
      const pain = i % 2 ? 8 : 2;
      entries[model.addDays(d, 1)] = { pain, cap: null, note: '', logs: [{ h: 480, pain }] };
    }
    const pairs = windows.buildPairs('alcoholVsNextMorning', entries, health);
    assert.equal(pairs.length, 12);
    assert.equal(pairs.filter(p => p.factor === 0).length, 0);
    assert.notEqual(engine.evaluate('alcoholVsNextMorning', pairs).verdict, 'possible');
    assert.equal(norm.normalizeDay({ ...mock.emptyBundle(today), alcohol: [{ ...sample(today), value: 0 }] }, clock).alcoholDrinks, 0);
  });

  await check('successful empty refresh removes stale data; failed refresh preserves it', async () => {
    const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
    const old = { date: today, coverage: { sleep: true }, sleepMinutes: 480 };
    db.putHealthDay(today, old);
    await sync.syncHealth(service(async d => ({ ...mock.emptyBundle(d), incomplete: true })), clock);
    assert.deepEqual(db.getHealthDay(today), old);
    await sync.syncHealth(service(async () => { throw Error('temporary failure'); }), clock);
    assert.deepEqual(db.getHealthDay(today), old);
    await sync.syncHealth(service(async d => mock.emptyBundle(d)), clock);
    assert.equal(db.getHealthDay(today), null);
  });

  await check('refresh timestamps distinguish successful silence from partial failures', async () => {
    const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
    await sync.syncHealth(service(async d => mock.emptyBundle(d)), clock);
    const successful = db.getHealthSyncStatus();
    assert.equal(successful.outcome, 'complete');
    assert.ok(successful.lastSuccess);
    assert.deepEqual(db.days, {});
    await sync.syncHealth(service(async d => ({ ...mock.emptyBundle(d), incomplete: true })), clock);
    assert.equal(db.getHealthSyncStatus().outcome, 'partial');
    assert.equal(db.getHealthSyncStatus().lastSuccess, successful.lastSuccess);
    assert.ok(db.getHealthSyncStatus().lastAttempt >= successful.lastAttempt);
  });
  await check('manual refresh joins the in-flight pass and waits for its real result', async () => {
    const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
    let resume, reached;
    const pending = new Promise(r => { resume = r; });
    const started = new Promise(r => { reached = r; });
    let queries = 0, done = false;
    const source = service(async d => { queries++; reached(); await pending; return mock.emptyBundle(d); });
    const first = sync.syncHealth(source, clock); await started;
    const second = sync.syncHealth(source, clock).then(() => { done = true; });
    await Promise.resolve(); assert.equal(done, false); assert.equal(queries, 1);
    resume(); await Promise.all([first, second]);
    assert.equal(done, true);
    assert.equal(queries, pure('thresholds').HEALTH_RESYNC_DAYS);
    assert.equal(db.getHealthSyncStatus().outcome, 'complete');
  });
  await check('a changed selection queues a fresh pass after invalidating the old pass', async () => {
    const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
    let resume, reached;
    const pending = new Promise(r => { resume = r; });
    const started = new Promise(r => { reached = r; });
    const selections = [];
    const source = service(async (d, cats) => { selections.push(cats.join(',')); reached(); await pending; return mock.emptyBundle(d); });
    const first = sync.syncHealth(source, clock); await started;
    sync.markHealthRequested(['movement']);
    const next = sync.syncHealth(source, clock); resume();
    await Promise.all([first, next]);
    assert.equal(selections[0], 'sleep');
    assert.ok(selections.slice(1).every(c => c === 'movement'));
    assert.equal(selections.length, pure('thresholds').HEALTH_BACKFILL_DAYS + 1);
    assert.equal(db.getHealthSyncStatus().outcome, 'complete');
  });

  for (const action of ['disconnect', 'clear', 'selection']) {
    await check(action + ' invalidates an in-flight sync and its watermark', async () => {
      const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
      let resume, entered;
      const pending = new Promise(r => { resume = r; });
      const reached = new Promise(r => { entered = r; });
      let queries = 0;
      const run = sync.syncHealth(service(async d => { queries++; entered(); await pending; return sleepBundle(d); }), clock);
      await reached;
      if (action === 'disconnect') sync.disconnectHealth();
      if (action === 'clear') db.clearHealthDays();
      if (action === 'selection') sync.markHealthRequested(['movement']);
      resume(); await run;
      assert.equal(Object.keys(db.days).length, 0);
      assert.equal(db.getHealthSyncedFrom(), null);
      assert.equal(db.getHealthSyncStatus(), null);
      assert.equal(queries, 1);
    });
  }

  await check('a failed backfill is retried instead of marked complete', async () => {
    const db = memoryDb(), sync = loadTs('src/health/sync.ts', { '../db': db });
    db.clearHealthDays();
    await sync.syncHealth(service(async d => ({ ...mock.emptyBundle(d), incomplete: true })), clock);
    assert.equal(db.getHealthSyncedFrom(), null);
    await sync.syncHealth(service(async d => mock.emptyBundle(d)), clock);
    assert.ok(db.getHealthSyncedFrom());
  });

  await check('HealthKit marks quantity and category failures separately from successful silence', async () => {
    let fail = true;
    const query = async () => { if (fail) throw Error('locked'); return []; };
    const kit = loadTs('src/health/healthkit.ts', {
      'react-native': { Platform: { OS: 'ios', Version: 26 } },
      '@kingstinct/react-native-healthkit': { isHealthDataAvailable: () => true,
        queryQuantitySamples: query, queryCategorySamples: query, queryWorkoutSamples: query,
        queryStateOfMindSamples: query, queryMedicationEvents: query, requestMedicationsAuthorization: async () => true },
    });
    const hk = new kit.HealthKitService();
    for (const c of ['sleep', 'movement', 'workouts', 'heart', 'nutrition', 'mind', 'medications']) {
      assert.equal((await hk.fetchDay(today, [c])).incomplete, true, c);
    }
    fail = false;
    assert.notEqual((await hk.fetchDay(today, ['sleep', 'nutrition'])).incomplete, true);
  });

  await check('background prompts respect live reminder, adaptive and Health choices', async () => {
    const db = memoryDb();
    db.putHealthDay(today, { date: today, coverage: { workouts: true }, workouts: [{ h: 540, minutes: 30 }] });
    let callback, on = false, adaptive = false, cats = ['workouts'], afterPermission = () => {};
    const sent = [];
    const bg = loadTs('src/health/background.ts', {
      '../db': db,
      '../model': { ...model, todayISO: () => today, minutesNow: () => 580 },
      '../reminderSchedule': { anyReminderOn: () => on, adaptiveOn: () => adaptive },
      './sync': { healthCategories: () => cats, healthRequestedOn: () => today, syncHealth: async () => {} },
      './healthkit': { deviceClock: clock, startBackgroundDelivery: (_, cb) => { callback = cb; return () => {}; } },
      'expo-notifications': { getPermissionsAsync: async () => { afterPermission(); return { granted: true }; },
        scheduleNotificationAsync: async n => { sent.push(n); } },
    });
    bg.startBackgroundPrompts(service());
    const fire = async () => { callback('workouts'); await new Promise(r => setImmediate(r)); };
    await fire(); assert.equal(sent.length, 0);
    on = true; await fire(); assert.equal(sent.length, 0);
    adaptive = true; cats = []; await fire(); assert.equal(sent.length, 0);
    cats = ['workouts']; afterPermission = () => { on = false; };
    await fire(); assert.equal(sent.length, 0);
    afterPermission = () => {}; on = true;
    await fire(); assert.equal(sent.length, 1);
  });

  await check('report recalculates comparisons and counts every dose inside its dates', () => {
    const entries = {}, health = {};
    for (let i = 0; i < 30; i++) {
      const date = model.addDays('2026-08-19', i);
      const before = i < 23 ? 8 : 4, after = i < 23 ? 2 : 4;
      entries[date] = { pain: before, cap: null, note: '', logs: [{ h: 480, pain: before }, { h: 570, pain: after }] };
      health[date] = { date, coverage: { medications: true, sleep: true }, sleepMinutes: i % 2 ? 480 : 300,
        doses: [{ h: 510, medId: 'example', med: 'Example', status: 'taken' }] };
    }
    const input = { entries, events: [], func: [], goalText: null, todayIso: '2026-09-17', windowDays: 7,
      healthDays: health, healthCategories: ['medications', 'sleep'] };
    const week = report.buildReportData(input);
    assert.equal(week.loggedDays, 7);
    assert.equal(week.health.medications[0].taken, 7);
    assert.equal(week.health.association, null);
    assert.ok(week.health.doses.every(d => d.pairs <= 7 && d.delta === 0));
    const month = report.buildReportData({ ...input, windowDays: 30 });
    assert.equal(month.health.doses[0].pairs, 30);
    assert.notEqual(month.health.doses[0].delta, 0);
    const sparse = { '2026-09-11': entries['2026-09-11'], '2026-09-17': entries['2026-09-17'] };
    assert.equal(report.buildReportData({ ...input, entries: sparse }).health.medications[0].taken, 7);
    const onlyNoPainDay = { '2026-09-12': health['2026-09-12'] };
    assert.equal(report.buildReportData({ ...input, entries: sparse, healthDays: onlyNoPainDay }).health.medications[0].taken, 1);
    const lateStart = report.buildReportData({ ...input, entries: { '2026-09-17': entries['2026-09-17'] } });
    assert.equal(lateStart.rangeStart, '2026-09-11');
    assert.equal(lateStart.health.medications[0].taken, 7);
  });

  await check('time edits preserve details, skips and capture stamps without overwriting another check-in', () => {
    for (const optional of [{ loc: ['neck'], locNote: 'left side', sym: ['fatigue'], symAsked: 1, q: ['aching'], qAsked: 1, locAsked: 1 },
      { locAsked: 1, locSkipped: 1, symAsked: 1, qAsked: 1 }, {}]) {
      const original = { h: 480, pain: 6, ts: 123, tz: 0, sv: 2, ...optional };
      const prev = { pain: 6, cap: null, note: '', logs: [original] };
      const moved = model.applyMoment(prev, 481, 6, original.loc, original.q, {}, 480);
      assert.deepEqual(moved.logs, [{ ...original, h: 481 }]);
      assert.deepEqual(prev.logs, [original]);
      assert.throws(() => model.applyMoment({ ...prev, logs: [original, { h: 481, pain: 4 }] }, 481, 6, [], [], {}, 480));
    }
  });
  await check('activity intentions keep never-asked, skipped and answered through backup validation', () => {
    for (const goal of [null, '', 'Walking the dog']) {
      const backup = model.validateBackup(JSON.stringify({ app: 'pattern', version: model.BACKUP_VERSION, entries: {}, goal }));
      assert.equal(backup.goal, goal);
    }
    assert.equal(model.validateBackup(JSON.stringify({ entries: {} })).goal, null);
    const data = report.buildReportData({ entries: { [today]: { pain: 4, cap: null, note: '' } },
      events: [], func: [], goalText: 'Walking the dog', todayIso: today, windowDays: 7 });
    const html = report.reportHtml(data);
    assert.ok(html.includes('Walking the dog'));
    assert.ok(!html.includes('Function over time'));
  });

  await check('Today shows early facts without upgrading them to findings', () => {
    const focus = pure('todayInsight').todayInsight;
    const empty = { best: null, early: [], first: [], progress: [], doses: { best: null } };
    assert.equal(focus(empty), null);
    const first = focus({ ...empty, first: [{ kind: 'sleepVsMorning', pairs: [
      { date: today, pain: 4, factor: 480, basis: 'inBed' },
    ] }] });
    assert.ok(first.body.includes('4/10'));
    assert.ok(first.context.includes('time in bed'));
    assert.ok(first.caveat.includes('not a finding'));
    const early = focus({ ...empty, early: [{ kind: 'sleepVsMorning', pairedDays: 4, delta: -6 }] });
    assert.ok(!early.body.includes('lower'));
    assert.ok(early.caveat.includes('not a pattern'));
    const waiting = focus({ ...empty, progress: [{ kind: 'sleepVsMorning', pairedDays: 0, needed: 18 }] });
    assert.ok(waiting.body.includes('check-in'));
    assert.ok(waiting.caveat.includes('not enough'));
  });
  console.log(passed + ' release regression checks passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
