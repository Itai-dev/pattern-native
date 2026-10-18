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
 * 4. Onboarding has a way back, and back only moves the step: the answers
 *    live in the screen's state until onDone, which is what keeps a skip
 *    a skip after stepping back over it (18 Oct 2026).
 * 5. Tab labels follow Dynamic Type, capped where the pill holds them.
 * 6. The day page's small controls reach 44pt by slop, and VoiceOver can
 *    do there what a finger does: change day, hear a figure as words,
 *    take back an optional answer (18 Oct 2026).
 * 6. Patterns gives no delta on pain and no verdict word, and every
 *    stand-out card carries its own "not" sentence (18 Oct 2026).
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

console.log('\nVoiceOver reaches "Add information" on Today');
check('the day card names the action', /name: 'addInfo', label: 'Add information'/.test(home));
check('and routes it to the same handler', /actionName === 'addInfo'\) onAddInfo\(\)/.test(home));

console.log('\nno lock-screen copy mentions a missed day');
for (const f of ['src/reminders.ts', 'src/health/background.ts', 'src/health/prompts.ts']) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strings = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || [];
  check(f, !strings.some((s) => /missed/i.test(s)));
}

console.log('\nonboarding has a way back');
const onboarding = read('src/OnboardingScreen.tsx');
const backFn = (onboarding.match(/const back = \(\) => \{[\s\S]*?\n  \};/) || [''])[0];
check('a back handler steps back one screen', /setStep\(step - 1\)/.test(backFn));
check('and touches no answer and finishes nothing',
  !!backFn && !/set(Diagnosis|Goal|GoalOther|Weekly|Where|Duration)\(|onDone/.test(backFn));
check('nothing in onboarding writes to the record before onDone',
  !/from '\.\/db'/.test(onboarding) && !/\bdb\./.test(onboarding));
const backBtn = onboarding.slice(onboarding.indexOf('onPress={back}') - 200, onboarding.indexOf('onPress={back}') + 400);
check('the control shows only after the first screen', /step > PROMISE && \(\s*<Press\s+onPress=\{back\}/.test(backBtn));
check('it is a button VoiceOver calls Back',
  /accessibilityRole="button"/.test(backBtn) && /accessibilityLabel="Back"/.test(backBtn));
check('the VoiceOver escape gesture goes the same way',
  /onAccessibilityEscape=\{step > PROMISE \? back : undefined\}/.test(onboarding));
check('its target is 44pt and it is white, not a ramp colour',
  /back: \{\s*minHeight: 44, minWidth: 44/.test(onboarding) &&
  /backText: \{ color: color\.textPrimary/.test(onboarding));

console.log('\ntab labels follow Dynamic Type');
const tabBar = read('src/TabBar.tsx');
check('no tab label opts out of scaling', !/allowFontScaling=\{false\}/.test(tabBar));
const cap = Number((tabBar.match(/const TAB_LABEL_MAX_SCALE = ([\d.]+);/) || [])[1]);
check('the cap is what a 40pt item holds (21 glyph + 3 gap + 13.1 × cap)',
  cap > 1 && 21 + 3 + 13.1 * cap <= 40);
check('every label uses it, on one line',
  (tabBar.match(/maxFontSizeMultiplier=\{TAB_LABEL_MAX_SCALE\}\s+numberOfLines=\{1\}/g) || []).length === 2);

console.log('\nPatterns: no pain delta, and the not-sentence on each card');
const trends = read('src/TrendsScreen.tsx');
check('the halves carry no delta and no verdict word',
  !/lower — easier|higher — harder|About the same across/.test(trends)
  && !/DIRECTION_SAME_BELOW/.test(trends));
check('the halves line says what it is not',
  /Averages of what you entered, not a measure of how you are doing\./.test(trends));
check('a stand-out card draws its own note',
  /\{!!card\.note && \(/.test(trends) && /note: c\.caveat/.test(trends)
  && /note: BUDGET_NOTE_SHORT/.test(trends) && /note: bestCopy\.disclaimer/.test(trends)
  && /note: doseBestCopy\.disclaimer/.test(trends) && /note: workoutBestCopy\.disclaimer/.test(trends));
check('Your pain says what its numbers are not',
  /not a score of how you are doing\."/.test(trends));

console.log('\nthe day page, for a hand that shakes and for VoiceOver');
const dayScreen = read('src/DayScreen.tsx');
const moments = read('src/DayMoments.tsx');
const mapScreen = read('src/MapScreen.tsx');
const eventSheet = read('src/EventSheet.tsx');
const theme = read('src/theme.ts');
const slop = (moments.match(/const ACT_SLOP = \{ top: (\d+), bottom: (\d+), left: (\d+), right: (\d+) \};/) || [])
  .slice(1).map(Number);
const actH = Number((moments.match(/\bact: \{ minHeight: (\d+)/) || [])[1]);
const actGap = Number((moments.match(/\bacts: \{[^}]*?gap: (\d+)/) || [])[1]);
check('Edit, Add information and Delete reach 44pt tall, and never overlap',
  slop.length === 4 && actH + slop[0] + slop[1] >= 44 && slop[2] + slop[3] <= actGap);
check('all three carry it',
  (moments.match(/style=\{styles\.act\}/g) || []).length === 3 &&
  (moments.match(/style=\{styles\.act\}\s+hitSlop=\{ACT_SLOP\}/g) || []).length === 3);
/* the narrowest grid: a 375pt phone at 2x, where the card's two
   hairlines cost a whole point — the same sum cellMetrics makes */
const pageX = Number((theme.match(/const PAGE_X = (\d+);/) || [])[1]);
const mapPad = Number((mapScreen.match(/const CARD_PAD = (\d+);/) || [])[1]);
const mapGap = Number((mapScreen.match(/const GAP = (\d+);/) || [])[1]);
const narrowCell = Math.floor((375 - pageX * 2 - mapPad * 2 - 1 - mapGap * 6) / 7);
check('a calendar day is 44pt wide on a 375pt phone, slop included',
  /const CELL_SLOP = GAP \/ 2;/.test(mapScreen) && narrowCell + mapGap >= 44 &&
  /hitSlop=\{\{ left: CELL_SLOP, right: CELL_SLOP \}\}/.test(mapScreen));
check('VoiceOver changes day from the date, one step each way',
  /accessibilityRole=\{view === 'day' \? 'adjustable' : 'header'\}/.test(dayScreen) &&
  /actionName === 'increment'\) stepDay\(1\)/.test(dayScreen) &&
  /actionName === 'decrement'\) stepDay\(-1\)/.test(dayScreen));
check('a jump between days is a cut under Reduce Motion',
  (dayScreen.match(/scrollToOffset\(\{ offset: (last|to) \* itemW, animated: !rm \}\)/g) || []).length === 2);
check('a figure is spoken in words, not "slash" and "dash"',
  /' out of 10'/.test(dayScreen) && /replace\('–', ' to '\)/.test(dayScreen) && /' out of 10'/.test(moments));
const clears = (eventSheet.match(/on \? null :/g) || []).length;
check('every optional answer in the event sheet says how to take it back',
  clears > 0 && clears === (eventSheet.match(/accessibilityHint=\{on \? CLEAR_HINT : undefined\}/g) || []).length);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
