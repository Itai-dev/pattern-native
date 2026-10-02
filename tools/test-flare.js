/**
 * Flare mode's words, held to the line between education and a claim.
 *
 * src/flare.ts is copy a person reads mid-flare. These checks are the
 * refusals in AGENTS.md ("Pain is information, recovery is the goal")
 * made mechanical: no promise that pain goes down, no diagnosis of the
 * pain as neuroplastic or imagined, no number asked for or reported, a
 * warning sign always ends at care, and the not-advice sentence exists.
 *
 *   node tools/test-flare.js
 */
const path = require('path');

const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const f = require(path.join(OUT, 'flare.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
};
const group = (n) => console.log('\n' + n);

/* every string the module exports, flattened */
const all = [];
const collect = (v) => {
  if (typeof v === 'string') all.push(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
Object.values(f).forEach(collect);

group('the copy makes no treatment claim and no diagnosis');
const banned = [
  /neuroplastic/i, /in your head/i, /all in your/i, /nothing (is )?wrong/i,
  /reduce[sd]? (your )?pain/i, /pain (went |goes )?down/i, /less pain/i,
  /cure/i, /\bheal(s|ed)?\b/i, /retrain/i, /rewire/i, /your brain (is|makes)/i,
  /\d+\s*\/\s*10/, /score/i, /streak/i,
];
for (const s of all) for (const b of banned) ok('no ' + b + ' in: ' + s.slice(0, 40), !b.test(s), s);

group('a warning sign always ends at care, and care ends the routine');
ok('different → care', f.afterCheck('different', false) === 'care');
ok('familiar with a sign → care', f.afterCheck('familiar', true) === 'care');
ok('familiar, no sign → settle', f.afterCheck('familiar', false) === 'settle');
ok('care has no next step', f.nextStep('care') === null);
ok('there are warning signs', f.WARNING_SIGNS.length >= 5);
ok('care names emergency services', f.CARE_BODY.some((s) => /emergency/i.test(s)));

group('the familiar path walks in order and ends');
const seen = [];
for (let s = 'check'; s; s = f.nextStep(s)) { if (s !== 'check') seen.push(s); if (seen.length > 10) break; }
ok('settle → track → fear → act', seen.join() === 'settle,track,fear,act', seen);

group('every fear has a reply, and the not-advice sentence exists');
for (const x of f.FEARS) ok('reply for ' + x.id, typeof x.reply === 'string' && x.reply.length > 20);
ok('not advice', /not medical advice/i.test(f.NOT_ADVICE));
ok('tracking closes on the practice, not the pain', /practised/.test(f.TRACK_DONE));

console.log('\nflare: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
