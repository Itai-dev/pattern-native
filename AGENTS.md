# Pattern

An iOS app for people with chronic pain to keep a record of it: check in a
few times a day, and get something worth showing a clinician. Expo / React
Native / TypeScript, iOS only for now, one solo founder, in beta with real
testers on TestFlight.

**Expo has changed.** Read the exact versioned docs at
https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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

**If `npm run verify` ends in `Error: spawn UNKNOWN`**, the export could
not run `hermesc.exe` — Windows Application Control has blocked it. That
is the machine owner's decision to reverse, never a build step. Publish
from EAS's servers instead:

```bash
git push origin master
npx eas-cli@latest workflow:run .eas/workflows/publish-update.yml
```

It publishes whatever is at the REMOTE head, so push first. It is
manual-only and carries no `on:` trigger — see the stray-publisher
section below for why that matters — and the head check afterwards
applies to it exactly as to a local publish.

A change to documentation alone — this file, `docs/` — is not in the bundle
and does not need publishing. Everything else does.

## Check that YOUR update is the newest one

```bash
npx eas-cli@latest update:list --branch production --limit 3
```

The top row should be the commit you just published. A phone takes
whatever is newest on the branch, so anything that publishes after you
replaces your work on every tester's device — and if it was built from an
older commit, the app appears to revert to a version nobody shipped.

This has happened. `.eas/workflows/publish.yml` published on every push;
it was deleted, but runs already queued from earlier pushes kept draining
for another hour, each checking out its own old commit and landing it at
the head of `production`. The publishes interleaved with a session's own,
so testers moved back and forth between the redesign and the version
before it, with nothing wrong in the app and nothing wrong in the update.

Read the list, not the dashboard's green tick. The row names its author —
`itai26` is a token, a GitHub App robot is a workflow — and the message is
the commit it was built from. `npx eas-cli@latest workflow:runs` shows
whether anything is still queued; `workflow:cancel` stops it. If an old
commit is sitting at the head, publishing again from master is the repair.

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

An ADDITIVE native module does not bump the runtime. The precedent is
expo-glass-effect and the pattern is HealthKit's too: the JS requires the
module inside try/catch, old binaries take the catch and live without the
feature, new binaries have it — and every phone keeps receiving the same
OTA updates because the runtime never changed. The guard is load-bearing:
an unguarded import of a native module crashes every binary that predates
it, at launch, via OTA. Bump the runtime only for a native change the JS
cannot guard around.

## A NEW native target needs a human, once

A new Xcode target — a widget extension, a watch app, an app clip —
gets its own bundle identifier, and its own provisioning profile.
`eas-cli` will register the identifier and sync capabilities using the
stored App Store Connect key, but it REFUSES TO CREATE THE PROFILE
outside an interactive terminal. It is a deliberate guard, not an
authentication limit, and it cannot be flagged away:

```
Distribution Certificate is not validated for non-interactive builds.
Failed to set up credentials.
```

Nothing routes around it. EAS's own build servers hit the same refusal.
The expo.dev credentials wizard only uploads or reuses profiles — it has
no generate. A fake TTY reaches the prompt and then asks for the Apple
ID password, which no session may ever type.

So: the owner runs `npx eas-cli@latest build --platform ios --profile
production --auto-submit` once in their own terminal, answers yes to the
Apple login, and lets it generate the profile. After that the profile
lives in EAS's credentials store and every later build — from a phone,
from a workflow, from a session with no terminal — signs that target
without asking.

Until it exists, EVERY iOS build fails. If a native target is committed
but not yet provisioned, say so plainly and offer to comment it out of
`app.json` rather than leaving builds broken for unrelated work.

# What this app refuses to do

These were argued out and paid for. They are not preferences, and a change
that breaks one is a regression even when it looks like an improvement.

**Colour means pain, or it is not a colour.** The ramp runs near-black to
near-white and a hue on this screen carries a score. Buttons are white on
every theme; counts and non-pain measures are white or neutral; only actual
pain values take the ramp. A button tinted with the pain palette borrows a
meaning it does not have.

**Nothing rewards looking at it.** No streaks, no rings, no week-over-week
deltas, no arrows, no completion percentages, nothing that differs between two
opens on the same day except data the user added. This is the surface most
likely to turn "I keep a record" into "I check my numbers five times a day",
and that is a harm, not engagement.

**The number is what the user entered.** Never invent a derived or composite
score. Pain and ability are separate scales and are never averaged. The same
day reads the same on Today, in the day detail, and in the summary a clinician
gets — an inverted "ease score" on one screen would be a defect, not a
feature.

**Three states, never two.** For every optional answer: never asked, asked and
skipped, and answered are distinguishable and stay that way through storage,
backup and migration. A skip is never read as a negative.

**Pain is the only mandatory answer.** Everything else is offered, never
demanded, and a pain-only entry is never called incomplete anywhere.

**Attributions are not findings.** What a user flags ("sleep made it worse")
is their read of their own day. It is recorded and shown as that, and never
fed to the engine — there are no good-sleep days in a list of days they blamed
sleep. The graded question is the version with something to compare against.

**Nothing you told it about your body leaves the phone.** The health record is
local SQLite. Analytics count that something happened, never what it said —
a closed event list, values capped at 24 characters, opt-out in Profile.
Changing that means rewriting `docs/POSITIONING.md` first.

**Thresholds are named and justified.** They live in `src/thresholds.ts` with
the arithmetic that argues for them. Do not inline a number that decides what
a user is told.

**Say what a thing does not mean, next to the thing.** Every section that
shows numbers carries the sentence about what they are not, and that sentence
belongs inside the card it qualifies.

# House style

Comments explain **why**, not what — the decision, the alternative rejected,
and the failure it prevents. Match the density of the file you are in; it is
high here on purpose. Copy is written from the user's side of the screen, in
plain words, and never cheerful about pain.

Prefer patch scripts written with the Write tool and run with `node` over long
shell one-liners; heredocs and escaping have broken repeatedly on this
Windows box. Normalise CRLF to LF before matching (`.replace(/\r\n/g, '\n')`),
and make patch scripts idempotent or guarded.
