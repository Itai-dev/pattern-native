# Two things that need you at the computer

Both are one-time. After each, everything downstream is automatic again
— including work done from a phone or by a session with no terminal of
its own.

Written 2026-08-31. Delete this file once both are done.

---

## 1. Unblock the Hermes compiler (5 minutes, do this first)

**What broke.** `npm run verify` ends by exporting both JS bundles, and
that step compiles them to Hermes bytecode with `hermesc.exe`. That
binary was reinstalled tonight as part of repairing a dependency, and
Windows **Application Control** blocked the new copy. The export now
fails with `Error: spawn UNKNOWN`, which means this machine cannot
publish an over-the-air update at all.

**Why you have to do it.** Allowing a blocked executable is a change to
your machine's security policy. That is yours to make, not a build
step, so nothing automated should ever do it for you.

**The file in question**

```
C:\Users\Itaia\Projects\pattern-native\node_modules\hermes-compiler\hermesc\win64-bin\hermesc.exe
```

It is part of `hermes-compiler`, a package published by Meta as part of
React Native, installed from the npm registry by `npm ci`. It is the
same compiler every previous successful build on this machine used; only
the copy is new.

**Steps**

1. Open **Windows Security** → **App & browser control**.
2. Look for a recent block notification, or open **Smart App Control /
   Application Control settings** and find the blocked item.
3. Allow `hermesc.exe`, or add the folder above as an exclusion.
4. Prove it worked:

   ```powershell
   cd C:\Users\Itaia\Projects\pattern-native
   npm run verify
   ```

   The last line should be `Exported: dist`. If it is, local publishing
   works again and step 3 of the normal ship loop is back.

**If you would rather not allow it.** That is a legitimate choice. The
fallback is already committed and works today:

```powershell
npx eas-cli@latest workflow:run .eas/workflows/publish-update.yml
```

That exports and publishes on EAS's servers instead, from whatever is at
the remote HEAD. It is manual-only on purpose. Push first, then run it,
then check the head as always.

---

## 2. Create the Apple Watch provisioning profile (2 minutes)

**What is blocked.** The watch app is written, tested and committed, but
its target `com.itaiagami.pattern.watch` has no provisioning profile.
Creating one is the single step `eas-cli` refuses to do without an
interactive terminal, and it needs your Apple ID password, which no
session should ever handle. The expo.dev website cannot do it either —
its wizard only uploads or reuses profiles, it does not generate them.

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
| anything else | Enter — the defaults are right |

Wait for the build URL, then close the window if you like; the build and
the TestFlight submission run on EAS's servers.

**Afterwards.** The profile persists in EAS's credentials store. Every
later build — including ones started with no terminal, and the
`build-ios.yml` workflow — signs the watch target without asking anyone
anything.

**If you would rather not build the watch yet**, say so and the target
can be commented out of `app.json` in a minute; the Swift and the
bridge stay in the repo, and iOS builds go back to working untouched.
Leaving it in means every iOS build fails until the profile exists.

---

## What is already done and needs nothing

- Build 29 is in TestFlight: lock-screen widgets (circular and
  rectangular), and the reworked home-screen sizes.
- The record's OTA branch is current: the reordered day, the event
  capture on Today, and the dependency repair are published.
