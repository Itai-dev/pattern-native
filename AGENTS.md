# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Pushing to master releases the app

`master` is what testers are running. A push to it triggers
`.eas/workflows/publish.yml`, which runs the tests and then publishes an
over-the-air update to real people's phones. There is no staging step and no
approval — **the push is the release.**

This is deliberate: it is what lets the app be changed from a phone, with no
computer in the loop. It means anything unfinished belongs on a branch, and a
commit to master is a decision to ship.

If a bad update lands: `eas update:rollback`, or the Updates tab on
expo.dev. Both work from a phone.

## The one change that cannot be undone over the air

`runtimeVersion` follows `appVersion`, so `version` in `app.json` is not a
label — it is the address an installed app uses to ask whether an update is
for it. Change it and every phone on the old version stops matching: they keep
asking for updates that will never be published again, and nothing reaches
them until they install a new binary from TestFlight.

Nothing errors when this happens. The publish succeeds, the dashboard looks
healthy, and the only symptom is testers silently stuck on an old build while
fixes ship to nobody.

`tools/test-runtime.js` fails the build if `app.json`'s version and the shipped
runtime disagree. Do not "fix" that failure by editing the guard to match. It
is asking a real question: **is a native build actually coming?** Only bump
both if the answer is yes, and say so out loud, because the repair needs
`eas build` — which needs a computer.

## What goes over the air, and what does not

JavaScript, TypeScript, styles and assets ship as updates. Anything native —
a new package with native code, a permission, an icon, the native sections of
`app.json` — needs `eas build` and a TestFlight submission, and cannot be done
from a phone.

## Before committing

`npm run verify` — typecheck, the full suite, and an export of both bundles.
It is what the workflow runs, so a green local run is the signal that a push
is safe.
