/**
 * The widget, tested the way the extension actually runs it.
 *
 * The 'widget' directive makes babel-preset-expo serialize the widget
 * function into a source string, and the extension evaluates that string
 * in a JavaScriptCore context containing ONLY the SwiftUI components,
 * the modifiers and the jsx runtime as globals. Nothing from the module
 * around the function exists there.
 *
 * That gap cannot be caught by TypeScript, by the app bundle, or by the
 * unit tests, because in all of those the module scope IS present. It
 * shipped a black rectangle twice before this file existed: once as a
 * missing containerBackground, and once as module constants that became
 * dangling identifiers in the serialized string.
 *
 * So this test does exactly what the extension does:
 *   1. compile src/WeekWidget.tsx with babel-preset-expo, as Metro would;
 *   2. pull the serialized function string out of the module;
 *   3. evaluate it in a vm sandbox stocked with the same globals the
 *      extension provides — and nothing else;
 *   4. render it with no props (the gallery preview) and with a full
 *      snapshot, and walk the element tree.
 *
 * If someone adds a module constant to the widget again, step 3 throws
 * ReferenceError here, on this machine, instead of after a native build,
 * a TestFlight submission and an install.
 *
 *   node tools/test-widget.js
 */
const path = require('path');
const vm = require('vm');
const babel = require(path.join(__dirname, '..', 'node_modules', '@babel', 'core'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + String(extra).slice(0, 300) : ''));
};

/* ── 1. compile as Metro compiles ──────────────────────────── */
const preset = require(path.join(
  __dirname, '..', 'node_modules', 'expo', 'node_modules', 'babel-preset-expo', 'build', 'index.js'
));
const compiled = babel.transformFileSync(
  path.join(__dirname, '..', 'src', 'WeekWidget.tsx'),
  {
    presets: [[preset, {}]],
    caller: { name: 'metro', platform: 'ios', supportsStaticESM: false },
    babelrc: false, configFile: false,
  }
).code;

/* ── 2. run the compiled module to get the layout string ───── */
const moduleSandbox = {
  exports: {}, module: { exports: {} }, console,
  require: (id) => {
    if (id === 'expo-widgets') {
      return { createWidget: (name, layout) => ({ name, layout }) };
    }
    /* the components and modifiers are irrelevant at module scope — the
       widget function is a string by now and never calls them here */
    return new Proxy({}, { get: () => () => ({}) });
  },
};
moduleSandbox.exports = moduleSandbox.module.exports;
vm.createContext(moduleSandbox);
vm.runInContext(compiled, moduleSandbox);
const layout = moduleSandbox.module.exports.default
  && moduleSandbox.module.exports.default.layout;

console.log('\nthe serialized widget');
ok('the directive produced a source string', typeof layout === 'string', typeof layout);

/* ── 3. the extension's world, and nothing more ────────────── */
const el = (type) => (config) => {
  const props = { ...config };
  if (Array.isArray(props.children)) props.children = props.children.flat(Infinity);
  return { type, props };
};
const mod = (name) => (...args) => ({ modifier: name, args });
const jsxProd = (type, config) => (typeof type === 'function' ? type(config) : el(type)(config));

const extensionGlobals = {
  VStack: el('VStack'), HStack: el('HStack'), ZStack: el('ZStack'),
  Text: el('Text'), Image: el('Image'),
  RoundedRectangle: el('RoundedRectangle'), Rectangle: el('Rectangle'),
  Circle: el('Circle'), Capsule: el('Capsule'), Spacer: el('Spacer'),
  padding: mod('padding'), frame: mod('frame'), font: mod('font'),
  foregroundStyle: mod('foregroundStyle'), background: mod('background'),
  cornerRadius: mod('cornerRadius'), widgetURL: mod('widgetURL'),
  containerBackground: mod('containerBackground'), opacity: mod('opacity'),
  jsx: jsxProd, jsxs: jsxProd, _jsx: jsxProd, _jsxs: jsxProd, jsxDEV: jsxProd,
};

let render = null, evalError = null;
try {
  const sandbox = { ...extensionGlobals };
  vm.createContext(sandbox);
  render = vm.runInContext('(' + layout + ')', sandbox);
} catch (e) { evalError = e; }

ok('the string evaluates with ONLY the extension globals — no module scope',
  !evalError && typeof render === 'function', evalError && evalError.message);

/* ── 4. render it both ways and walk the tree ──────────────── */
const walk = (node, out) => {
  if (!node || typeof node !== 'object') return out;
  out.push(node);
  const kids = node.props && node.props.children;
  (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach((k) => walk(k, out));
  return out;
};

/** every family the widget declares in app.json. Each one is a separate
 *  branch of the same serialized function, so each one is a separate
 *  chance to reference something that does not exist in the sandbox. */
const FAMILIES = [
  'systemSmall', 'systemMedium', 'systemLarge',
  'accessoryCircular', 'accessoryRectangular', 'accessoryInline',
];
/** rows of seven: one, two, five */
const SQUARES = { systemSmall: 7, systemMedium: 14, systemLarge: 35 };
const textOf = (nodes) => nodes.filter((n) => n.type === 'Text')
  .map((n) => n.props.children).join(' | ');

if (render) {
  console.log('\nthe gallery preview (no props at all)');
  FAMILIES.forEach((fam) => {
    let preview = null, previewErr = null;
    try { preview = render({}, { widgetFamily: fam }); } catch (e) { previewErr = e; }
    ok(fam + ' renders without throwing', !previewErr, previewErr && previewErr.message);
    if (!preview) return;
    const nodes = walk(preview, []);
    ok(fam + ' declares its container background', preview.props.modifiers.some((m) =>
      m.modifier === 'containerBackground'));
    ok(fam + ' is a link into the check-in', preview.props.modifiers.some((m) =>
      m.modifier === 'widgetURL' && m.args[0] === 'pattern://checkin'));
    /* a day with nothing in it must never read as a zero — zero is a
       real answer on this scale, and the widget has no way to say which
       one it meant */
    ok(fam + ' shows no number before anything is logged',
      textOf(nodes).indexOf('0') < 0, textOf(nodes));
    if (fam.indexOf('system') === 0) {
      const shapes = nodes.filter((n) => n.type === 'RoundedRectangle');
      ok(fam + ' draws ' + SQUARES[fam] + ' squares', shapes.length === SQUARES[fam], shapes.length);
      ok(fam + ' falls back to the empty-day outline', shapes.every((s) =>
        s.props.modifiers.some((m) =>
          m.modifier === 'foregroundStyle' && m.args[0] === '#2E2E30')));
    }
  });

  console.log('\na real snapshot');
  const snap = {
    d0: '#111111', d1: '#222222', d2: '#333333', d3: '#444444',
    d4: '#555555', d5: '#666666', d6: '#777777',
    w0: 'M', w1: 'T', w2: 'W', w3: 'T', w4: 'F', w5: 'S', w6: 'S',
    caption: 'Checked in today', last: '7', word: 'Severe', at: '19:29', tint: '#AAAAAA',
    lock: 'number',
  };
  /* g0 oldest … g34 today; the last seven agree with d0…d6 */
  for (let i = 0; i < 35; i++) snap['g' + i] = i >= 28 ? snap['d' + (i - 28)] : '#0' + String(i).padStart(5, '0');
  FAMILIES.forEach((fam) => {
    let full = null, fullErr = null;
    try { full = render(snap, { widgetFamily: fam }); } catch (e) { fullErr = e; }
    ok(fam + ' renders a snapshot without throwing', !fullErr, fullErr && fullErr.message);
    if (!full) return;
    const nodes = walk(full, []);
    const words = textOf(nodes);
    ok(fam + ' says the number the user entered', words.indexOf('7') >= 0, words);
    if (fam === 'systemSmall' || fam === 'systemMedium' || fam === 'accessoryRectangular') {
      ok(fam + ' says when', words.indexOf('19:29') >= 0, words);
    }
    if (fam.indexOf('system') === 0) {
      const fills = nodes.filter((n) => n.type === 'RoundedRectangle').map((s) =>
        s.props.modifiers.filter((m) => m.modifier === 'foregroundStyle')[0].args[0]);
      ok(fam + ' draws ' + SQUARES[fam] + ' squares from the snapshot', fills.length === SQUARES[fam], fills.length);
      ok(fam + ' lands the last seven colours oldest-first, today last', JSON.stringify(fills.slice(-7)) === JSON.stringify(
        ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777']), fills.slice(-7));
      if (fam === 'systemLarge') ok('the large grid starts at the oldest cell', fills[0] === snap.g0, fills[0]);
      ok(fam + ' labels the days', words.indexOf('M') >= 0 && words.indexOf('W') >= 0, words);
    }
    /* the calm-surface rule, enforced rather than remembered: nothing
       derived may reach a surface the user cannot dismiss */
    ok(fam + ' shows nothing averaged, counted or compared',
      words.toLowerCase().indexOf('average') < 0
      && words.toLowerCase().indexOf('week') < 0
      && words.indexOf('%') < 0
      && words.indexOf('↑') < 0 && words.indexOf('↓') < 0, words);
  });

  console.log('\n' + 'the discreet lock screen');
  ['accessoryCircular', 'accessoryRectangular', 'accessoryInline'].forEach((fam) => {
    const quiet = { ...snap, lock: 'discreet' };
    let out = null, err = null;
    try { out = render(quiet, { widgetFamily: fam }); } catch (e) { err = e; }
    ok(fam + ' renders discreet without throwing', !err, err && err.message);
    if (!out) return;
    const words = textOf(walk(out, []));
    ok(fam + ' keeps the number off the lock screen by default', words.indexOf('7') < 0 && words.indexOf('Severe') < 0, words);
    ok(fam + ' still says a check-in happened', /logged|checked in/i.test(words), words);
    ok(fam + ' is still a link into the check-in', walk(out, []).some((n) =>
      n.props && n.props.modifiers && n.props.modifiers.some((m) => m.modifier === 'widgetURL')));
  });
  /* home-screen families are behind the passcode and keep the number either way */
  ['systemSmall', 'systemMedium', 'systemLarge'].forEach((fam) => {
    const words = textOf(walk(render({ ...snap, lock: 'discreet' }, { widgetFamily: fam }), []));
    ok(fam + ' keeps the number on the home screen', words.indexOf('7') >= 0, words);
  });
}

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
