/**
 * Source-level guards for promises the screens make and no unit can
 * reach — there is no UI renderer in this suite, so these read the code.
 *
 * 1. A tap at five is choosing five. The check-in starts live at 5, so
 *    the slider's value is never null; it must be told the value is not
 *    yet CHOSEN, or it seeds its last step at 5 and a tap there changes
 *    nothing it can see — Done stays dim, no haptic (found 18 Oct 2026).
 * 2. The reminder offered beside the activity card is the morning one,
 *    because the card reads only mornings (health/capacity.ts).
 * 3. No reminder that lands on a lock screen mentions a missed day — the
 *    offer on Today promises exactly that.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

let passed = 0, failed = 0;
function check(name, ok) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

const slider = read('src/Slider.tsx');
const checkin = read('src/CheckinScreen.tsx');
const home = read('src/HomeScreen.tsx');
const schedule = read('src/reminderSchedule.ts');

console.log('\na tap at five counts');
check('Slider takes a chosen prop', /chosen\?: boolean/.test(slider));
check('an unchosen value seeds no last step',
  /useSharedValue\(value == null \|\| !chosen \? -1 : value\)/.test(slider));
check('VoiceOver double-tap chooses what is on screen',
  /name: 'activate'/.test(slider) && /actionName === 'activate'/.test(slider));
const sliderUse = checkin.slice(checkin.indexOf('<Slider'), checkin.indexOf('/>', checkin.indexOf('<Slider')));
check('the check-in tells the slider whether it was touched', /chosen=\{moved\}/.test(sliderUse));

console.log('\nthe reminder beside the activity card is a morning one');
check('enableMorningReminder turns on the m slot only',
  /export async function enableMorningReminder[\s\S]{0,200}on: s\.key === 'm'/.test(schedule));
check('Today picks it when the activity card shows',
  /showActivity \? enableMorningReminder : enableEveningReminder/.test(home));

console.log('\nno lock-screen copy mentions a missed day');
for (const f of ['src/reminders.ts', 'src/health/background.ts', 'src/health/prompts.ts']) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strings = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || [];
  check(f, !strings.some((s) => /missed/i.test(s)));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
