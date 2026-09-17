/* Real React state transitions with native surfaces replaced by host nodes.
   This checks screen behavior, not iOS layout or native integrations. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = require('assert/strict');
const ts = require('typescript'), React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const ROOT = path.join(__dirname, '..');
const cache = new Map();
const fakeDb = { getPref: (_, fallback) => fallback, getBackground: () => null, getDiagnosis: () => null,
  getCopySeen: () => null, setPref() {}, setDiagnosis() {}, setCopySeen() {} };
const overrides = {
  'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable',
    StyleSheet: { create: x => x, hairlineWidth: 1 }, Alert: { alert() {} } },
  'src/motion': { Press: 'Press' },
  'src/db': fakeDb,
  'src/analytics': { track() {} },
  'src/DayScreen': { fmtDay: date => date },
  'src/MapScreen': { __esModule: true, default: () => React.createElement('Calendar') },
  'src/reminderSchedule': { anyReminderOn: () => true, savedSlots: () => [], enableEveningReminder: async () => 'on' },
};
function load(rel) {
  const base = rel.replace(/\.(tsx?|js)$/, '');
  if (base in overrides) return overrides[base];
  if (cache.has(base)) return cache.get(base).exports;
  const filename = ['.ts', '.tsx'].map(ext => path.join(ROOT, base + ext)).find(fs.existsSync);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} }; cache.set(base, mod);
  const req = name => name in overrides ? overrides[name] : name.startsWith('.')
    ? load(path.relative(ROOT, path.resolve(path.dirname(filename), name))) : require(name);
  vm.runInThisContext('(function(require,module,exports){' + compiled + '\n})', { filename })(req, mod, mod.exports);
  return mod.exports;
}
const Trends = load('src/TrendsScreen').default;
const Home = load('src/HomeScreen').default;
const Intention = load('src/ActivityIntention').default;
const Comparisons = load('src/PatternComparisons').default;
const { todayISO, addDays } = load('src/model');
const { buildComparisons } = load('src/health/comparisons');
const textOf = tree => tree == null ? '' : typeof tree === 'string' ? tree
  : Array.isArray(tree) ? tree.map(textOf).join(' ') : textOf(tree.children);
const findButton = (root, label) => root.findAll(n => typeof n.type === 'string'
  && (n.props.onPress && (n.props.accessibilityLabel === label || textOf(n.toJSON?.()) === label)))[0];
const press = async node => { assert.ok(node, 'button exists'); await act(() => node.props.onPress()); };
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function mount(component, props) { let tree; await act(() => { tree = create(React.createElement(component, props)); }); return tree; }
const entry = pain => ({ pain, cap: null, note: '', logs: [{ h: 480, pain }] });
async function main() {
  await check('empty Week keeps range controls and returns to All without changing hook order', async () => {
    const spans = [];
    const tree = await mount(Trends, { entries: { '2026-08-20': entry(4) }, events: [], func: [], goalText: null,
      todayIso: '2026-09-17', healthDays: {}, healthCategories: [], onOpenDay() {}, onSpanChange: n => spans.push(n) });
    assert.doesNotMatch(textOf(tree.toJSON()), /Lowest\s+4/);
    await press(findButton(tree.root, 'Week'));
    assert.match(textOf(tree.toJSON()), /No pain check-ins in this range/);
    await press(findButton(tree.root, 'All'));
    assert.doesNotMatch(textOf(tree.toJSON()), /No pain check-ins in this range/);
    const history = findButton(tree.root, 'Your history');
    await press(history);
    assert.match(textOf(tree.toJSON()), /Lowest\s+4/);
    assert.deepEqual(spans, [29, 7, 29]);
    await act(() => tree.unmount());
  });
  await check('evidence is collapsed by default and See why opens the supported family', async () => {
    const entries = {}, health = {};
    for (let i = 0; i < 30; i++) { const d = addDays('2026-08-19', i);
      entries[d] = entry(i % 2 ? 2 : 8);
      health[d] = { date: d, coverage: { sleep: true }, sleepMinutes: i % 2 ? 480 : 300 }; }
    const rows = buildComparisons(entries, health, ['sleep'], '2026-08-19', '2026-09-17');
    const tree = await mount(Comparisons, { rows, onOpenDay() {} });
    assert.doesNotMatch(textOf(tree.toJSON()), /Average pain · 0–10/);
    await press(findButton(tree.root, 'See the evidence for ' + rows[0].title));
    assert.match(textOf(tree.toJSON()), /Average pain · 0–10/);
    assert.equal(tree.root.findByProps({ accessibilityLabel: 'Sleep. 1 observation worth watching' }).props.accessibilityState.expanded, true);
    await act(() => tree.unmount());
    const linked = await mount(Comparisons, { rows, onOpenDay() {}, initialComparisonId: rows[0].id });
    assert.match(textOf(linked.toJSON()), /Average pain · 0–10/);
    await act(() => linked.unmount());
  });
  await check('Today opens the last recorded day even when today has no entry; zero remains a real score', async () => {
    const yesterday = addDays(todayISO(), -1); let opened, checks = 0;
    const tree = await mount(Home, { entries: { [yesterday]: entry(0) }, activity: '', onActivityChange() {}, insight: null,
      onOpenRecord() {}, onLog: () => checks++, onOpenDay: d => { opened = d; }, healthDays: {},
      appointment: '', healthOfferable: false, ahead: null, experiment: null, lastCopy: null });
    assert.match(textOf(tree.toJSON()), /0\s*\/10/);
    const last = tree.root.findAll(n => n.type === 'Press' && n.props.accessibilityHint === 'Opens the recorded day and its details')[0];
    await press(last); assert.equal(opened, yesterday);
    await press(findButton(tree.root, 'Check in')); assert.equal(checks, 1);
    await act(() => tree.unmount());
  });
  await check('Today discloses when sleep means time in bed', async () => {
    const date = todayISO();
    const tree = await mount(Home, { entries: { [date]: entry(3) }, activity: '', onActivityChange() {},
      insight: { id: 'sleepVsMorning', body: 'An observation about sleep.', caveat: 'Not a cause.' },
      onOpenRecord() {}, onLog() {}, onOpenDay() {},
      healthDays: { [date]: { date, sleepMinutes: 480, sleepKind: 'inBed', coverage: { sleep: true } } },
      appointment: '', healthOfferable: false, ahead: null, experiment: null, lastCopy: null });
    assert.match(textOf(tree.toJSON()), /Sleep here is time in bed/);
    await act(() => tree.unmount());
  });
  await check('compact intention remains editable and removal preserves an explicit skip', async () => {
    let saved;
    const tree = await mount(Intention, { value: 'Walk the dog', compact: true, onChange: v => { saved = v; } });
    await press(findButton(tree.root, 'Edit what matters to you: Walk the dog'));
    await act(() => tree.root.findByType('TextInput').props.onChangeText('  Cooking dinner  '));
    await press(findButton(tree.root, 'Save activity intention'));
    assert.equal(saved, 'Cooking dinner');
    await press(findButton(tree.root, 'Edit what matters to you: Walk the dog'));
    await press(findButton(tree.root, 'Remove activity intention'));
    assert.equal(saved, '');
    await act(() => tree.unmount());
  });
  console.log(passed + ' screen interaction scenarios passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
