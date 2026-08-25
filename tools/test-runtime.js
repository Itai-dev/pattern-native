/**
 * The runtime-version guard.
 *
 * THE FAILURE THIS EXISTS TO PREVENT. runtimeVersion follows appVersion,
 * so app.json's `version` is not a label — it is the address an installed
 * app uses to ask whether an update is for it. Change it, and every phone
 * already carrying 1.3.0 stops matching: they keep asking u.expo.dev for
 * 1.3.0 updates, the new ones are published under 1.4.0, and nothing
 * reaches them again until they install a new binary from TestFlight.
 *
 * Nothing errors. `eas update` succeeds, the dashboard shows a healthy
 * publish, and the only symptom is testers quietly stuck on an old build
 * while you keep shipping fixes to nobody. It is the single worst thing
 * that can happen to a record of this app, because the person on the old
 * build has no way to know and no way to say so.
 *
 * It is also the one change that CANNOT be repaired over the air. Fixing
 * it needs a native build, which needs a computer — so on a day when the
 * only tool available is a phone, this bump is unrecoverable until you
 * get back to a desk.
 *
 * So the number is written down twice: here, and in app.json. Changing
 * one without the other fails the build. That is the entire mechanism —
 * it does not stop you bumping the version, it stops you bumping it by
 * accident, and it makes you say out loud that a new binary is coming.
 *
 * WHEN YOU DO MEAN IT: bump `version` in app.json, bump SHIPPED_RUNTIME
 * below to match, and plan on `eas build` + `eas submit`. Every OTA
 * update after that point reaches only the new binary.
 */
const path = require('path');
const app = require(path.join(process.cwd(), 'app.json'));

/**
 * The runtime version currently installed on testers' devices.
 *
 * This is NOT app.json's version restated — it is the last version that
 * was actually built and shipped to TestFlight. They are equal in the
 * normal case, and the whole point of the file is to notice when they
 * stop being.
 */
const SHIPPED_RUNTIME = '1.3.0';

let fail = 0;
const ok = (name, cond) => {
  if (!cond) { fail++; console.log('  FAIL  ' + name); }
  else console.log('  ok    ' + name);
};

console.log('\nruntime version');

ok('app.json version matches the runtime testers are on',
  app.expo.version === SHIPPED_RUNTIME);

ok('runtimeVersion still follows appVersion',
  app.expo.runtimeVersion && app.expo.runtimeVersion.policy === 'appVersion');

ok('the update URL still points at this EAS project',
  app.expo.updates
  && app.expo.updates.url === 'https://u.expo.dev/' + app.expo.extra.eas.projectId);

if (fail && app.expo.version !== SHIPPED_RUNTIME) {
  console.log(
    '\n  app.json says ' + app.expo.version + ', testers are on ' + SHIPPED_RUNTIME + '.'
    + '\n  An over-the-air update published now would reach NOBODY on the old'
    + '\n  build, silently and permanently, until they install a new binary.'
    + '\n'
    + '\n  If that is deliberate: set SHIPPED_RUNTIME in tools/test-runtime.js'
    + '\n  to ' + app.expo.version + ' and plan an eas build + eas submit.'
    + '\n  If it is not: put app.json back to ' + SHIPPED_RUNTIME + '.'
  );
}

console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + 'runtime guard');
process.exit(fail ? 1 : 0);
