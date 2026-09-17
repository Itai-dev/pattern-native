/**
 * The words under a tapped dot on the layered day page.
 *
 *   node tools/test-glance.js
 */
const path = require('path');
const OUT = process.env.PATTERN_TEST_OUT || path.join(__dirname, '..', '.testbuild');
const g = require(path.join(OUT, 'dayGlance.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
};
const clock = (h) => ('0' + Math.floor(h / 60)).slice(-2) + ':' + ('0' + (h % 60)).slice(-2);

const logs = [{ h: 460, pain: 2 }, { h: 720, pain: 6 }, { h: 850, pain: 4 }];

ok('an empty day has no moment to show', g.latestH([]) === undefined && g.shownH([], 720) === undefined);
ok('the chart lands on the newest check-in', g.latestH(logs) === 850);
ok('a tapped dot is shown while it exists', g.shownH(logs, 720) === 720);
ok('a deleted dot falls back to the newest, never to nothing', g.shownH(logs, 999) === 850);
ok('tapping nothing shows the newest', g.shownH(logs, undefined) === 850);

const events = [{ h: 690, kind: 'flare' }, { h: 300, kind: 'treatment' }, { h: 900, kind: 'other' }];
ok('the event before a moment is the nearest earlier one', g.eventBefore(events, 720).h === 690);
ok('an event at the same minute counts as before', g.eventBefore(events, 690).h === 690);
ok('nothing earlier means no event', g.eventBefore(events, 100) === null);
ok('the line names the event, lower-cased, at its minute',
  g.afterLine(g.eventBefore(events, 720), clock) === 'after the flare at 11:30', g.afterLine(g.eventBefore(events, 720), clock));
ok('"something else" reads without the article',
  g.afterLine({ h: 900, kind: 'other' }, clock) === 'after something else at 15:00');
ok('no event, no line', g.afterLine(null, clock) === '');
ok('the line is about when, never why', !/because|caused|made|worse|better/.test(g.afterLine(events[0], clock)));

const m = { h: 720, pain: 6, loc: ['lowerBack', 'unknownPlace'], locNote: 'right side', q: ['aching'], sym: ['stiffness'] };
const chips = g.chipsFor(m);
ok('chips run places, own words, qualities, symptoms', chips.length === 5
  && chips[1] === 'unknownPlace' && chips[2] === '“right side”', chips);
ok('a forgotten id is shown as itself, not dropped', chips.indexOf('unknownPlace') >= 0);
ok('a bare check-in has no chips', g.chipsFor({ h: 1, pain: 3 }).length === 0);
ok('a skipped where question is not a chip', g.chipsFor({ h: 1, pain: 3, locAsked: 1, locSkipped: 1 }).length === 0);

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
