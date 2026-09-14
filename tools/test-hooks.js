/**
 * The rules-of-hooks guard.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. React counts hook calls per render
 * and requires the same count every time. A `return` placed above a
 * `useMemo` breaks that silently: the component works for as long as the
 * early return never fires, and the first render that takes it throws
 * "Rendered fewer hooks than expected" and kills the screen.
 *
 * It shipped once. TrendsScreen returned an empty state when
 * buildReportData came back null, and two useMemo calls sat below that
 * return. Every range with logged days rendered ten hooks; the first
 * range without them rendered eight. Choosing Week with nothing logged
 * in the last seven days crashed the screen — which is to say it crashed
 * for exactly the person who had stopped logging for a fortnight, and
 * the range control is the only control on that screen.
 *
 * Nothing in the type system catches this: every line is valid
 * TypeScript, the test suite is pure domain logic with no renderer, and
 * an export builds fine. The only cheap check is structural, so it is
 * done here against the real TypeScript AST rather than with a regex —
 * a `return` inside a useMemo callback is not a guard clause, and no
 * pattern match short of a parser tells those apart.
 *
 * WHAT IT ALLOWS. Hooks before any return, as many as you like. Guard
 * clauses, as many as you like, provided every hook is above them. The
 * fix when this fails is always the same: hoist the hook above the
 * return and make it read its inputs as possibly-absent.
 *
 *   node tools/test-hooks.js
 */
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', 'node_modules', 'typescript'));

const ROOT = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) files.push(p);
  });
})(path.join(ROOT, 'src'));
files.push(path.join(ROOT, 'App.tsx'));

/* Anything named useSomething is a hook by React's own convention, which
   covers the libraries too — useAnimatedStyle and useSafeAreaInsets are
   as order-sensitive as useState. */
const IS_HOOK = /^use[A-Z]\w*$/;

const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)
  || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

let failures = 0;
let scanned = 0;

for (const file of files.sort()) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const check = (body, name) => {
    if (!body || !ts.isBlock(body)) return;
    scanned++;
    const returns = [];
    const hooks = [];
    /* own-body only: descending into a nested function would count a
       `return` inside a callback, which is not a guard clause */
    const walkOwn = (n) => {
      if (n !== body && isFn(n)) return;
      if (ts.isReturnStatement(n)) returns.push(n.getStart());
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        const nm = ts.isIdentifier(e) ? e.text
          : (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name) ? e.name.text : null);
        if (nm && IS_HOOK.test(nm)) hooks.push({ pos: n.getStart(), name: nm });
      }
      n.forEachChild(walkOwn);
    };
    body.forEachChild(walkOwn);
    if (!returns.length || !hooks.length) return;

    const firstReturn = Math.min.apply(null, returns);
    const skippable = hooks.filter((h) => h.pos > firstReturn);
    if (!skippable.length) return;

    failures += skippable.length;
    const rel = path.relative(ROOT, file);
    console.log('  FAIL ' + rel + ' [' + name + ']');
    console.log('       a return on line ' + lineOf(firstReturn)
      + ' can skip ' + skippable.length + ' hook call'
      + (skippable.length === 1 ? '' : 's') + ':');
    skippable.forEach((h) => console.log('         line ' + lineOf(h.pos) + '  ' + h.name + '()'));
    console.log('       move ' + (skippable.length === 1 ? 'it' : 'them')
      + ' above that return; read the guarded value as possibly-absent.');
  };

  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text)) {
      check(n.body, n.name.text);
    }
    if (ts.isVariableStatement(n)) {
      n.declarationList.declarations.forEach((d) => {
        if (d.name && ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && d.initializer) {
          let init = d.initializer;
          // React.memo(Component) / forwardRef(Component)
          if (ts.isCallExpression(init) && init.arguments.length) init = init.arguments[0];
          if (isFn(init)) check(init.body, d.name.text);
        }
      });
    }
    n.forEachChild(visit);
  };
  sf.forEachChild(visit);
}

console.log(failures
  ? '\nFAILED rules-of-hooks guard — ' + failures + ' hook call(s) can be skipped'
  : 'PASSED rules-of-hooks guard (' + scanned + ' component bodies)');
process.exit(failures ? 1 : 0);
