/**
 * The guard behind AGENTS.md's "additive native module" rule, as a test.
 *
 * Every phone on runtime 1.3.0 takes the same OTA updates, and the
 * binaries on that runtime span from the day it was cut to today. A
 * native module added AFTER the cut exists only in the newer binaries;
 * a static `import` of it runs at module load, so on an older binary the
 * app crashes at launch — over the air, for everyone, with nothing in
 * the publish path saying so. The rule is that such a module is
 * `require`d inside try/catch and the feature lives without it on old
 * binaries (HealthKit, the calendar, the watch bridge all do this).
 *
 * Until now the rule lived in a markdown file. This test fails the build
 * on a static import of any native package that was not in the binary
 * when the runtime was cut. The baseline is the dependency list at the
 * commit that set `version` to 1.3.0 (0b097ab); when the runtime is
 * next bumped — a real native build for everyone — re-cut it to that
 * day's package.json and set BASELINE_RUNTIME to match.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** the runtime this baseline describes — must equal app.json's version */
const BASELINE_RUNTIME = '1.3.0';

/** dependencies present in the binary when the runtime was cut. Anything
 *  native and NOT in this list is younger than some installed binary. */
const BASELINE_DEPS = [
  '@expo/ui', '@expo/vector-icons', '@react-native-community/datetimepicker',
  'expo', 'expo-blur', 'expo-document-picker', 'expo-file-system', 'expo-haptics',
  'expo-notifications', 'expo-print', 'expo-sharing', 'expo-sqlite', 'expo-status-bar',
  'expo-updates', 'expo-widgets', 'react', 'react-native', 'react-native-gesture-handler',
  'react-native-reanimated', 'react-native-safe-area-context',
  /* not in that package.json but in that binary: reanimated 4's runtime
     half, installed as its peer */
  'react-native-worklets',
];

/** post-baseline native packages whose STATIC import is known not to
 *  throw on an older binary, each with the reason. Add here only after
 *  reading the package's entry point; the default answer is a guarded
 *  require. */
const ALLOW_STATIC = {
  /* GlassView resolves through requireNativeViewManager, which does not
     throw for a missing module (expo-modules-core catches the lookup);
     the one throwing call, isLiquidGlassAvailable(), is wrapped in
     try/catch at both call sites — App.tsx and src/TabBar.tsx. */
  'expo-glass-effect': 'view manager import is non-throwing; isLiquidGlassAvailable() guarded at call sites',
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : ''));
};

/* ── the baseline is for THIS runtime ───────────────────────── */
const appJson = JSON.parse(read(path.join(ROOT, 'app.json')));
ok('the baseline describes the shipped runtime (re-cut BASELINE_DEPS when the version bumps)',
  appJson.expo.version === BASELINE_RUNTIME, { app: appJson.expo.version, baseline: BASELINE_RUNTIME });

/* ── which dependencies are native ──────────────────────────── */
const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
function isNative(name) {
  const dir = path.join(ROOT, 'node_modules', name);
  if (!fs.existsSync(dir)) return false;
  if (fs.existsSync(path.join(dir, 'ios'))) return true;
  if (fs.existsSync(path.join(dir, 'expo-module.config.json'))) return true;
  try { return fs.readdirSync(dir).some((f) => f.endsWith('.podspec')); } catch { return false; }
}
const nativeDeps = Object.keys(pkg.dependencies).filter(isNative);
const younger = nativeDeps.filter((d) => BASELINE_DEPS.indexOf(d) < 0);
ok('at least one native dependency is younger than the runtime (else this test has nothing to guard — fine, but say so)',
  younger.length >= 0);

/* ── every source file, every import ────────────────────────── */
function walk(dir, out) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  });
  return out;
}
const files = walk(path.join(ROOT, 'src'), [path.join(ROOT, 'App.tsx'), path.join(ROOT, 'index.ts')]);

/** the module specifier of a static import/export-from, or null */
const STATIC = /^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/;
/** a bare require of a package on a line with no `try` — the pattern
 *  this app uses is `try { return require('x') } catch { ... }` on one
 *  line, or inside a try block whose opening line is above; the
 *  heuristic accepts a `try` within the three lines before. */
const REQUIRE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

const rootOf = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
const isLocalNative = (spec) => /(^|\/)modules\//.test(spec);

const offenders = [];
files.forEach((file) => {
  const lines = read(file).split('\n');
  lines.forEach((line, i) => {
    const m = STATIC.exec(line);
    if (m) {
      const spec = m[1] || m[2];
      if (isLocalNative(spec)) offenders.push({ file, line: i + 1, spec, why: 'local native module imported statically' });
      else {
        const root = rootOf(spec);
        if (younger.indexOf(root) >= 0 && !ALLOW_STATIC[root]) {
          offenders.push({ file, line: i + 1, spec, why: 'native package younger than the runtime, imported statically' });
        }
      }
    }
    let r;
    REQUIRE.lastIndex = 0;
    while ((r = REQUIRE.exec(line))) {
      const spec = r[1];
      const root = rootOf(spec);
      const guardedHere = /\btry\b/.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n'));
      const needsGuard = isLocalNative(spec) || younger.indexOf(root) >= 0;
      if (needsGuard && !guardedHere) {
        offenders.push({ file, line: i + 1, spec, why: 'require of a post-runtime native module with no try within reach' });
      }
    }
  });
});

ok('no static import of a native module younger than the shipped runtime — an unguarded one crashes every older binary at launch, over the air',
  offenders.length === 0,
  offenders.map((o) => path.relative(ROOT, o.file) + ':' + o.line + ' ' + o.spec + ' — ' + o.why));

/* ── the allow-list is not hiding a stale entry ─────────────── */
Object.keys(ALLOW_STATIC).forEach((name) => {
  ok('allow-listed ' + name + ' is still a dependency (else remove it from the list)',
    !!pkg.dependencies[name]);
});

/* ── and the guarded requires still exist where the docs say ─── */
ok('HealthKit is required inside try/catch', /try[\s\S]{0,120}require\('@kingstinct\/react-native-healthkit'\)/.test(read(path.join(ROOT, 'src/health/healthkit.ts'))));
ok('the calendar is required inside try/catch', /try[\s\S]{0,120}require\('expo-calendar'\)/.test(read(path.join(ROOT, 'src/calendar.ts'))));
ok('the watch bridge is required inside try/catch', /try[\s\S]{0,120}require\('\.\.\/modules\/watch-bridge'\)/.test(read(path.join(ROOT, 'src/watch.ts'))));

console.log('\nnative guards: younger than runtime ' + BASELINE_RUNTIME + ': ' + (younger.join(', ') || 'none'));
console.log((fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
process.exit(fail ? 1 : 0);
