# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# How to ship a change

`master` is what testers are running. Real people have this app installed, so
finishing a change means getting it onto their phones — a commit that never
publishes has changed nothing.

Unless told otherwise, do all four of these and do not stop after the third:

```bash
npm run verify
git add -A && git commit -m "<message>"
git push origin master
npx eas-cli@latest update --branch production --environment production --message "<short summary>"
```

`npm run verify` is typecheck, the full suite, and an export of both bundles.
If it fails, fix it — do not publish around it.

The update command needs `EXPO_TOKEN` in the environment. Check with
`npx eas-cli@latest whoami`; if that fails, say so and stop rather than
committing work that cannot ship.

If a bad update lands: `npx eas-cli@latest update:rollback`, or the Updates
tab on expo.dev. Both work from a phone.

Tell the user to force-quit the app twice. An update downloads on one launch
and applies on the next; one force-quit looks like nothing happened.

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
