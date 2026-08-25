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

if (render) {
  console.log('\nthe gallery preview (no props at all)');
  let preview = null, previewErr = null;
  try { preview = render({}, { widgetFamily: 'systemSmall' }); } catch (e) { previewErr = e; }
  ok('renders without throwing', !previewErr, previewErr && previewErr.message);
  if (preview) {
    const nodes = walk(preview, []);
    const shapes = nodes.filter((n) => n.type === 'RoundedRectangle');
    ok('seven squares', shapes.length === 7, shapes.length);
    ok('every square falls back to the empty-day outline', shapes.every((s) =>
      s.props.modifiers.some((m) =>
        m.modifier === 'foregroundStyle' && m.args[0] === '#2E2E30')));
    ok('the caption falls back to Check in', nodes.some((n) =>
      n.type === 'Text' && n.props.children === 'Check in'));
    ok('the container declares its background', preview.props.modifiers.some((m) =>
      m.modifier === 'containerBackground'));
    ok('the whole surface is a link into the check-in', preview.props.modifiers.some((m) =>
      m.modifier === 'widgetURL' && m.args[0] === 'pattern://checkin'));
  }

  console.log('\na real snapshot');
  const snap = {
    d0: '#111111', d1: '#222222', d2: '#333333', d3: '#444444',
    d4: '#555555', d5: '#666666', d6: '#777777', caption: 'Checked in today',
  };
  let full = null, fullErr = null;
  try { full = render(snap, { widgetFamily: 'systemMedium' }); } catch (e) { fullErr = e; }
  ok('renders without throwing', !fullErr, fullErr && fullErr.message);
  if (full) {
    const nodes = walk(full, []);
    const fills = nodes.filter((n) => n.type === 'RoundedRectangle').map((s) =>
      s.props.modifiers.filter((m) => m.modifier === 'foregroundStyle')[0].args[0]);
    ok('the seven colours land oldest-first', JSON.stringify(fills) === JSON.stringify(
      ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777']), fills);
    ok('the caption is the snapshot caption', nodes.some((n) =>
      n.type === 'Text' && n.props.children === 'Checked in today'));
  }
}

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
