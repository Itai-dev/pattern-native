/**
 * week_active — the one analytics event that carries a number about
 * time (weeks.ts, analytics.ts; POSITIONING 18 Oct 2026).
 *
 * 1. The arithmetic: 1-based calendar weeks from the first check-in,
 *    DST-proof, null for nonsense, stopping after WEEK_ACTIVE_LAST.
 * 2. Once per week, upward only: a clock set back never resends.
 * 3. The wiring, read from source because analytics.ts imports the
 *    database and cannot load here: the event is in the closed list,
 *    carries `week` and nothing else, goes through track() (the one
 *    place the opt-out is honoured), and runs from both check-in paths.
 *
 *   node tools/test-weeks.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.PATTERN_TEST_OUT || path.join(ROOT, '.testbuild');
const wk = require(path.join(OUT, 'weeks.js'));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''));
};
const group = (n) => console.log('\n' + n);

group('the arithmetic');
ok('the first day is week 1', wk.weekSince('2026-10-18', '2026-10-18') === 1);
ok('day 6 is still week 1', wk.weekSince('2026-10-18', '2026-10-24') === 1);
ok('day 7 is week 2', wk.weekSince('2026-10-18', '2026-10-25') === 2);
ok('days 21–27 are week 4', wk.weekSince('2026-10-18', '2026-11-08') === 4
  && wk.weekSince('2026-10-18', '2026-11-14') === 4 && wk.weekSince('2026-10-18', '2026-11-15') === 5);
ok('across a month and a year', wk.weekSince('2026-12-28', '2027-01-04') === 2);
ok('a daylight-saving night is one day, not a short one',
  wk.weekSince('2026-03-22', '2026-03-29') === 2 && wk.weekSince('2026-10-19', '2026-10-26') === 2);
ok('today before the first day is no week', wk.weekSince('2026-10-18', '2026-10-17') === null);
ok('an unreadable date is no week', wk.weekSince('', '2026-10-18') === null
  && wk.weekSince('18/10/2026', '2026-10-18') === null && wk.weekSince(null, '2026-10-18') === null);

group('once per week, upward only, and it stops');
ok('nothing sent yet: week 1 goes', wk.weekToSend('2026-10-18', '2026-10-18', 0) === 1);
ok('week 1 sent: a second check-in that week sends nothing', wk.weekToSend('2026-10-18', '2026-10-20', 1) === null);
ok('a skipped week is not filled in: week 2 sent, next check-in in week 4 sends 4',
  wk.weekToSend('2026-10-18', '2026-11-08', 2) === 4);
ok('a clock set back never resends an earlier week', wk.weekToSend('2026-10-18', '2026-10-19', 3) === null);
ok('the last week goes', wk.weekToSend('2026-10-18', '2027-01-10', 12) === wk.WEEK_ACTIVE_LAST);
ok('past the last week, nothing — not a clamped repeat',
  wk.weekToSend('2026-10-18', '2027-01-17', wk.WEEK_ACTIVE_LAST) === null
  && wk.weekToSend('2026-10-18', '2027-06-01', 0) === null);
ok('a malformed last-sent reads as nothing sent', wk.weekToSend('2026-10-18', '2026-10-18', 'x') === 1);
ok('every value that can travel is a small positive integer', (() => {
  for (let d = 0; d < 400; d++) {
    const t = new Date(Date.UTC(2026, 9, 18 + d)).toISOString().slice(0, 10);
    const w = wk.weekToSend('2026-10-18', t, 0);
    if (w !== null && !(Number.isInteger(w) && w >= 1 && w <= wk.WEEK_ACTIVE_LAST)) return false;
  }
  return true;
})());

group('the wiring');
const an = read('src/analytics.ts');
const union = an.slice(an.indexOf('export type EventName'), an.indexOf('type PropValue'));
ok('week_active is in the closed list', /\|\s*'week_active'/.test(union));
const body = (() => {
  const i = an.indexOf('export function trackWeek');
  return i < 0 ? '' : an.slice(i, an.indexOf('\n}\n', i));
})();
ok('trackWeek exists', body.length > 0);
ok('it is sent through track(), which alone honours the opt-out',
  /track\('week_active', \{ week \}\)/.test(body) && !/fetch\(/.test(body));
ok('it carries the week and nothing else', (body.match(/track\(/g) || []).length === 1);
ok('the arithmetic is weeks.ts’s, not inlined', /weekToSend\(/.test(body) && !/\/ 7|86400000/.test(body));
const checkin = an.slice(an.indexOf('export function trackCheckin'));
ok('a phone check-in counts its week before first_checkin’s flag moves',
  checkin.indexOf('trackWeek(') > 0 && checkin.indexOf('trackWeek(') < checkin.indexOf('PREF_FIRSTSENT'));
ok('a watch check-in counts too', /if \(wrote\) trackWeek\(/.test(read('src/watch.ts')));
ok('weeks.ts is in the domain build', /src\/weeks\.ts/.test(JSON.parse(read('package.json')).scripts['build:domain']));

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
