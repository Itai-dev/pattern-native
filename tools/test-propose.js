/**
 * The walls around the on-device model (docs/AI.md, src/ai/propose.ts).
 *
 * The model is non-deterministic and never runs here. What is pinned is
 * everything it is NOT allowed to do: propose a number, propose pain,
 * propose an id no tap could choose, write a sentence, or be believed
 * when half of what it said was invented. Plus the input cap, the
 * confirmation counts, and the provenance flag's round trip through the
 * sanitiser that backup and restore go through.
 *
 *   node tools/test-propose.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const propose = require(path.join(OUT, 'ai', 'propose.js'));
const metrics = require(path.join(OUT, 'metrics.js'));
const model = require(path.join(OUT, 'model.js'));
const th = require(path.join(OUT, 'thresholds.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 240) : ''));
};
const group = (n) => console.log('\n' + n);

const WHERE = 'body.areas.v1', FEEL = 'pain.quality.v1', WORSE = 'impact.worse.v1';
const SLEEP = 'sleep.quality.v1', EXP = 'experiment.did.v1';
const PAIN = 'pain.intensity.v3', LIMIT = 'pain.interference.v1';

/* ── the schema is built from the registry, never by hand ────── */
group('schema: ids only, from the registry');
ok('an ordinal becomes a one-of over its level ids', (() => {
  const s = propose.buildSchema([SLEEP]);
  const f = s.fields[0];
  return s.fields.length === 1 && f.id === SLEEP && f.kind === 'one'
    && f.options.map((o) => o.id).join() === 'poor,okay,good'
    && f.question === metrics.getMetric(SLEEP).question;
})(), propose.buildSchema([SLEEP]));
ok('a set becomes a many-of over the CHIPS a person can tap', (() => {
  const f = propose.buildSchema([WHERE]).fields[0];
  const ids = f.options.map((o) => o.id);
  return f.kind === 'many' && ids.join() === model.LOC_CHIP_IDS.join()
    && ids.indexOf('kneeL') < 0 && f.options.every((o) => o.label && o.label !== o.id);
})());
ok('quality words and impact chips are their vocabularies', (() => {
  const q = propose.buildSchema([FEEL]).fields[0].options.map((o) => o.id);
  const w = propose.buildSchema([WORSE]).fields[0].options.map((o) => o.id);
  return q.join() === model.QUALITYIDS.join() && w.join() === metrics.IMPACT_IDS.join();
})());
ok('order is the caller\'s, duplicates dropped, unknown ids dropped', (() => {
  const s = propose.buildSchema([WORSE, SLEEP, WORSE, 'no.such.metric.v9', WHERE]);
  return s.fields.map((f) => f.id).join() === [WORSE, SLEEP, WHERE].join();
})());
ok('the JSON key is an identifier and maps back to the id', (() => {
  const f = propose.buildSchema([SLEEP]).fields[0];
  return f.key === 'sleep_quality_v1' && /^[A-Za-z0-9_]+$/.test(f.key) && propose.keyOf(SLEEP) === f.key;
})());
ok('an empty ask is an empty schema, not a crash', propose.buildSchema([]).fields.length === 0);

/* ── the refusals, by construction ────────────────────────────── */
group('what can never be in the schema');
ok('pain is never a field', propose.fieldFor(PAIN) === null);
ok('"limited by pain" is never a field', propose.fieldFor(LIMIT) === null);
ok('NO numeric metric in the whole registry becomes a field', (() =>
  metrics.METRICS.every((m) => m.type !== 'numeric' || propose.fieldFor(m.id) === null))());
ok('every metric with a closed list of ids becomes a field', (() =>
  metrics.METRICS.every((m) => {
    const hasIds = (m.type === 'ordinal' && m.levels && m.levels.length) || m.type === 'set';
    return hasIds ? propose.fieldFor(m.id) !== null : true;
  }))());
ok('an ordinal WITHOUT levels is one the registry itself refuses to ask, and stays out', (() =>
  metrics.METRICS.every((m) => m.type !== 'ordinal' || (m.levels && m.levels.length)
    || (propose.fieldFor(m.id) === null && !!m.excludedBecause)))());
ok('every option of every field is a value the metric accepts', (() =>
  metrics.METRICS.every((m) => {
    const f = propose.fieldFor(m.id);
    if (!f) return true;
    if (f.kind === 'one') return f.options.every((o) => metrics.validAnswerValue(m.id, o.id));
    if (m.vocabulary === 'body') return f.options.every((o) => model.LOCIDS.indexOf(o.id) >= 0);
    if (m.vocabulary === 'quality') return f.options.every((o) => model.QUALITYIDS.indexOf(o.id) >= 0);
    return f.options.every((o) => metrics.validSetMember(m.id, o.id));
  }))());
ok('the JSON schema has no free string and no number anywhere', (() => {
  const all = metrics.METRICS.map((m) => m.id);
  const js = propose.toJsonSchema(propose.buildSchema(all));
  const props = js.properties;
  return js.type === 'object' && Object.keys(props).length > 0 && Object.keys(props).every((k) => {
    const p = props[k];
    if (p.type === 'string') return Array.isArray(p.enum) && p.enum.length > 0;
    if (p.type === 'array') return p.items.type === 'string' && Array.isArray(p.items.enum) && p.items.enum.length > 0;
    return false;
  });
})());
ok('the instructions name every question and say to leave out, not guess', (() => {
  const s = propose.buildSchema([WHERE, SLEEP]);
  const t = propose.instructions(s);
  return t.indexOf(metrics.getMetric(WHERE).question) >= 0
    && t.indexOf(metrics.getMetric(SLEEP).question) >= 0
    && /leave that question out/i.test(t) && /never guess/i.test(t)
    && !/pain score|0.10|rate/i.test(t);
})());

/* ── the input ───────────────────────────────────────────────── */
group('the input');
ok('nothing to read is null', propose.prepareInput(['', null, undefined, '   ']) === null);
ok('parts join on lines, whitespace collapses',
  propose.prepareInput(['slept   badly ', null, '  long walk']) === 'slept badly\nlong walk');
ok('the cap is the named threshold and over it is a refusal, not a trim', (() => {
  const under = 'x'.repeat(th.AI_INPUT_MAX_CHARS);
  const over = 'x'.repeat(th.AI_INPUT_MAX_CHARS + 1);
  return propose.prepareInput([under]) === under && propose.prepareInput([over]) === null;
})());
ok('two capped notes always fit', 280 * 3 <= th.AI_INPUT_MAX_CHARS);

/* ── the output ──────────────────────────────────────────────── */
group('validate: dropped whole, never repaired');
const S = propose.buildSchema([WHERE, SLEEP, WORSE]);
ok('a clean reply maps keys back to metric ids in schema order', (() => {
  const p = propose.validate(S, {
    impact_worse_v1: ['sleep', 'work'], body_areas_v1: ['lowerBack'], sleep_quality_v1: 'poor',
  });
  return p && p.map((x) => x.id).join() === [WHERE, SLEEP, WORSE].join()
    && p[0].ids.join() === 'lowerBack' && p[1].ids.join() === 'poor' && p[2].ids.join() === 'sleep,work';
})());
ok('leaving a question out is absence, not an error', (() => {
  const p = propose.validate(S, { sleep_quality_v1: 'good' });
  return p && p.length === 1 && p[0].id === SLEEP;
})());
ok('null, empty string and empty list all read as left out', (() => {
  const p = propose.validate(S, { sleep_quality_v1: null, body_areas_v1: [], impact_worse_v1: '' });
  return p && p.length === 0;
})());
ok('an empty object is a valid empty proposal', (() => {
  const p = propose.validate(S, {});
  return p && p.length === 0;
})());
ok('one invented level drops the WHOLE reply', propose.validate(S, {
  sleep_quality_v1: 'terrible', body_areas_v1: ['lowerBack'],
}) === null);
ok('one id outside a set\'s chips drops the whole reply', propose.validate(S, {
  body_areas_v1: ['lowerBack', 'kneeL'],
}) === null);
ok('a question that was not asked drops the whole reply', propose.validate(S, {
  sleep_quality_v1: 'poor', pain_quality_v1: ['aching'],
}) === null);
ok('a number where an id was asked for drops it', propose.validate(S, { sleep_quality_v1: 2 }) === null);
ok('a pain score smuggled in under any name drops it', propose.validate(S, {
  sleep_quality_v1: 'poor', pain_intensity_v3: 7,
}) === null);
ok('a list for a one-of drops it, a string for a many-of drops it',
  propose.validate(S, { sleep_quality_v1: ['poor'] }) === null
  && propose.validate(S, { body_areas_v1: 'lowerBack' }) === null);
ok('a non-string inside a list drops it', propose.validate(S, { body_areas_v1: ['lowerBack', 3] }) === null);
ok('a repeated id in a list is kept once', (() => {
  const p = propose.validate(S, { body_areas_v1: ['neck', 'neck', 'head'] });
  return p && p[0].ids.join() === 'neck,head';
})());
ok('not an object is null', propose.validate(S, null) === null && propose.validate(S, 'poor') === null
  && propose.validate(S, ['poor']) === null && propose.validate(S, undefined) === null);
ok('an empty schema accepts only an empty reply', (() => {
  const E = propose.buildSchema([]);
  const a = propose.validate(E, {});
  return a && a.length === 0 && propose.validate(E, { sleep_quality_v1: 'poor' }) === null;
})());

/* ── the confirmation ────────────────────────────────────────── */
group('offer → resolve → summary');
const P = propose.validate(S, { body_areas_v1: ['lowerBack', 'hips'], sleep_quality_v1: 'poor', impact_worse_v1: ['sleep'] });
ok('offer copies, it does not alias', (() => {
  const st = propose.offer(P);
  st.offered[0].ids.push('head');
  return P[0].ids.length === 2;
})());
ok('the same chips in another order is accepted', (() => {
  let st = propose.offer(P);
  st = propose.resolve(st, WHERE, ['hips', 'lowerBack']);
  return st.outcome[WHERE] === 'accepted' && propose.wasSuggested(st, WHERE, ['hips', 'lowerBack']);
})());
ok('one chip more or fewer is changed, and carries no provenance', (() => {
  let st = propose.offer(P);
  st = propose.resolve(st, WHERE, ['lowerBack']);
  const fewer = st.outcome[WHERE];
  st = propose.resolve(st, WHERE, ['lowerBack', 'hips', 'neck']);
  return fewer === 'changed' && st.outcome[WHERE] === 'changed'
    && !propose.wasSuggested(st, WHERE, ['lowerBack']);
})());
ok('nothing chosen is ignored, and a skip is never suggested', (() => {
  let st = propose.offer(P);
  st = propose.resolve(st, SLEEP, undefined);
  const a = st.outcome[SLEEP];
  st = propose.resolve(st, SLEEP, []);
  return a === 'ignored' && st.outcome[SLEEP] === 'ignored' && !propose.wasSuggested(st, SLEEP, []);
})());
ok('the last decision wins', (() => {
  let st = propose.offer(P);
  st = propose.resolve(st, SLEEP, ['okay']);
  st = propose.resolve(st, SLEEP, ['poor']);
  return st.outcome[SLEEP] === 'accepted';
})());
ok('a question nothing was offered for records nothing', (() => {
  let st = propose.offer(P);
  const before = st;
  st = propose.resolve(st, FEEL, ['aching']);
  return st === before && !propose.wasSuggested(st, FEEL, ['aching']) && propose.offeredFor(st, FEEL) === null;
})());
ok('summary counts and names metric ids only', (() => {
  let st = propose.offer(P);
  st = propose.resolve(st, WHERE, ['lowerBack', 'hips']);
  st = propose.resolve(st, SLEEP, ['okay']);
  const s = propose.summary(st);
  return s.offered === 3 && s.accepted === 1 && s.changed === 1 && s.ignored === 0
    && s.perMetric.length === 3 && s.perMetric[2].outcome === null
    && s.perMetric.every((m) => typeof m.id === 'string' && Object.keys(m).join() === 'id,outcome');
})());
ok('the summary never carries a chosen or offered id', (() => {
  const s = propose.summary(propose.offer(P));
  return JSON.stringify(s).indexOf('lowerBack') < 0 && JSON.stringify(s).indexOf('poor') < 0;
})());

/* ── provenance through the sanitiser ────────────────────────── */
group('sug: 1 through cleanAnswer');
const answer = (value, extra) => ({ value, h: 540, ts: 1, tz: 120, qv: 1, pid: null, ...extra });
ok('a confirmed suggestion keeps its flag', (() => {
  const c = model.cleanCtx({ v: 1, a: { [SLEEP]: answer('poor', { sug: 1 }) } });
  return c && c.a[SLEEP].sug === 1 && c.a[SLEEP].value === 'poor';
})());
ok('an answer without the flag gains none', (() => {
  const c = model.cleanCtx({ v: 1, a: { [SLEEP]: answer('poor') } });
  return c && !('sug' in c.a[SLEEP]);
})());
ok('anything but 1 is not a flag', (() => {
  const c = model.cleanCtx({ v: 1, a: { [SLEEP]: answer('poor', { sug: true }) } });
  const d = model.cleanCtx({ v: 1, a: { [SLEEP]: answer('poor', { sug: 2 }) } });
  return c && !('sug' in c.a[SLEEP]) && d && !('sug' in d.a[SLEEP]);
})());
ok('a skip can never have been suggested', (() => {
  const c = model.cleanCtx({ v: 1, a: { [SLEEP]: answer('', { skipped: 1, sug: 1 }) } });
  return c && c.a[SLEEP].skipped === 1 && !('sug' in c.a[SLEEP]);
})());
ok('the engine\'s value reads the same with or without the flag', (() => {
  const e1 = { pain: 4, cap: null, note: '', ctx: { v: 1, a: { [SLEEP]: answer('poor', { sug: 1 }) } } };
  const e2 = { pain: 4, cap: null, note: '', ctx: { v: 1, a: { [SLEEP]: answer('poor') } } };
  return model.valueOf(e1, SLEEP) === 'poor' && model.valueOf(e2, SLEEP) === 'poor';
})());

/* ── the experiment's evening question, the one ordinal asked today ── */
group('the questions the check-in asks today');
ok('the experiment question is a yes/no one-of', (() => {
  const f = propose.fieldFor(EXP);
  return f && f.kind === 'one' && f.options.map((o) => o.id).join() === 'no,yes';
})());
ok('a real check-in ask (where, feel, worse, better, experiment) builds five fields and no number', (() => {
  const s = propose.buildSchema([WHERE, FEEL, WORSE, 'impact.better.v1', EXP, LIMIT, PAIN]);
  return s.fields.length === 5 && s.fields.every((f) => f.id !== LIMIT && f.id !== PAIN);
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
