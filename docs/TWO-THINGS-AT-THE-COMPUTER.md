# Two things that need you at the computer

Both are one-time. After each, everything downstream is automatic again
— including work done from a phone or by a session with no terminal of
its own.

Written 2026-08-31, updated 2026-09-15. Delete this file once both are
done.

---

## 1. Unblock the Hermes compiler — DONE 2026-09-05

`npm run verify` exports both bundles again on this machine; three
updates published locally that day. Nothing left to do here. The
server-side fallback (`workflow:run .eas/workflows/publish-update.yml`)
stays committed for the day it is needed again.

---

## 2. Create the watch provisioning profiles — DONE 2026-09-05

Builds 46 and 47 that afternoon were built with both watch targets in
the tree, signed, and 47 was submitted to TestFlight — which is only
possible once the profiles exist. They now live in EAS's credentials
store, and every later build (including `build-ios.yml` and any
started with no terminal) signs both targets without asking. Nothing
left to do here; the section below is what the next build carries.

---

## What is already done and needs nothing

- Build 47 (commit e1d0946, 5 September) is in TestFlight: the watch app,
  the face complication, the lock-screen widgets and the reworked
  home-screen sizes. It predates the three native things in section 3.
- The production branch is current with master as of 15 September; the
  10–14 September work (load budget, the evening before, the experiment,
  bad-day chips, check-in depth, the (i) explanations) is published.

---

## 3. The next build carries three native things (nothing to do but build)

Committed 2026-09-08, all guarded so the current binary is unaffected:

| What | Where | What it enables |
| --- | --- | --- |
| HealthKit background delivery entitlement | `app.json` → HealthKit plugin `background: true` | iOS wakes Pattern when a workout or a night lands; `src/health/background.ts` sends one prompt at that moment |
| expo-calendar + `NSCalendarsUsageDescription` | `app.json` plugin list, `src/calendar.ts` | "Use my calendar" in Profile: an after-event prompt for entries that read as exertion |
| Notification category "checkin" | `src/reminders.ts` | a **Check in** button on every prompt, on the iPhone and mirrored to the watch; tapping opens the question (the watch app IS the question) |

**Build 48 (commit 0b9c4a0, 15 September) carries all three and is
built** — but its TestFlight submission ERRORED in eighteen seconds
with no error surfaced (submission 773d6d3b, 16 September). That is
the signature from the HealthKit build in August: Apple's upload
validator rejecting the IPA. The new thing in this build is the
`com.apple.developer.healthkit.background-delivery` entitlement, and
the stored provisioning profile predates it, so the likely cause is
the first wall in the memory note — a profile without the capability.

**What needs you, once:** on developer.apple.com → Identifiers →
com.itaiagami.pattern → HealthKit, tick **Background Delivery**; then on
expo.dev → pattern → Credentials → iOS → App Store, delete the stored
provisioning profile (never the distribution certificate). Then build
49 with `--auto-submit`; it mints a profile that carries the
entitlement. If 49 also errors, download its IPA and read Info.plist
and embedded.mobileprovision — the validator's real message is not
surfaced by EAS.

None of the three has run on a device. The background-delivery path in
particular is the library's promise that JS runs on a background wake;
the first build with the entitlement that INSTALLS is where that gets
proven.
