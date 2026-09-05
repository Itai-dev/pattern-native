# Two things that need you at the computer

Both are one-time. After each, everything downstream is automatic again
— including work done from a phone or by a session with no terminal of
its own.

Written 2026-08-31, updated 2026-09-05. Delete this file once both are
done.

---

## 1. Unblock the Hermes compiler — DONE 2026-09-05

`npm run verify` exports both bundles again on this machine; three
updates published locally that day. Nothing left to do here. The
server-side fallback (`workflow:run .eas/workflows/publish-update.yml`)
stays committed for the day it is needed again.

---

## 2. Create the watch provisioning profiles (2 minutes)

**What is blocked.** The watch app is written, tested and committed, and
so is its face complication — and neither target has a provisioning
profile:

| Target | Bundle id | What it is |
| --- | --- | --- |
| PatternWatch | `com.itaiagami.pattern.watch` | the watch app: the pain-only check-in, worn |
| PatternComplication | `com.itaiagami.pattern.watch.complication` | the face complication: one tap from the face into it |

Creating a profile is the single step `eas-cli` refuses to do without an
interactive terminal, and it needs your Apple ID password, which no
session should ever handle. The expo.dev website cannot do it either —
its wizard only uploads or reuses profiles, it does not generate them.
One interactive build creates both.

**Steps**

```powershell
cd C:\Users\Itaia\Projects\pattern-native
npx eas-cli@latest whoami
```

If that prints `itai26`, continue. If it errors, run
`npx eas-cli@latest login` first.

```powershell
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

Then answer:

| Prompt | Answer |
| --- | --- |
| Do you want to log in to your Apple account? | **Y** |
| Apple ID | Enter (it pre-fills `itaiagami@gmail.com`) |
| Password | your Apple ID password — it goes to Apple, not to Expo |
| Two-factor code | the six digits on your iPhone |
| Reuse this distribution certificate? | **Y** / Enter |
| Generate a new Apple Provisioning Profile? (PatternWatch) | **Y** |
| Generate a new Apple Provisioning Profile? (PatternComplication) | **Y** |
| anything else | Enter — the defaults are right |

Wait for the build URL, then close the window if you like; the build and
the TestFlight submission run on EAS's servers.

**Afterwards.** The profiles persist in EAS's credentials store. Every
later build — including ones started with no terminal, and the
`build-ios.yml` workflow — signs both targets without asking anyone
anything.

**What that build carries that no update can.** Everything native from
the 5 September review, all of it committed and waiting on this one
build:

- the watch app: tap the square's halves to step the value beside the
  crown, a three-second Undo on the check, and the line that says the
  check-in lands when the iPhone next opens Pattern;
- the watch-face complication;
- the phone hearing a watch check-in the moment it arrives while the app
  is open (a native event on the bridge);
- the widget's two new families — inline on the lock screen, large on
  the home screen — and the discreet lock screen, which is the default:
  no number unless it is turned on in Profile.

The JavaScript half of all of this is already published over the air and
is harmless on the current binary: the Profile switch stores a preference
the old widget ignores, and the bridge listener is guarded.

**If you would rather not build the watch yet**, say so and both watch
targets can be commented out of `targets/` in a minute; the Swift and the
bridge stay in the repo, and iOS builds go back to working untouched.
Leaving them in means every iOS build fails until the profiles exist.

---

## What is already done and needs nothing

- Build 29 is in TestFlight: lock-screen widgets (circular and
  rectangular), and the reworked home-screen sizes.
- The production branch is current with master: the 5 September review's
  three over-the-air batches are published.
