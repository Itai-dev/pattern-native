# The copy the server cannot read

*Decided 17 Sep 2026. POSITIONING.md carries the promise this changes;
AGENTS.md carries the rule. This file is the design, and the argument for
each choice. The envelope, the store and the client seam are built; the
native module, the sign-in and the screens are not.*

## What this is for

One failure, named: **delete and reinstall on the same phone.** iOS hands a
reinstalled app a fresh, empty container and never consults the device
backup, so the record is gone while the backup sits there intact. Every
external tester meets exactly this case on a ninety-day TestFlight clock,
and the manual copy we ship today only helps the people who made one.

The phone's own backup already answers a lost or replaced phone. This
answers the other case, and it answers it without asking a person in a
flare to have done homework in advance.

## What it is not

- **Not sync.** One writer, this phone, always. A later upload replaces an
  earlier one. No merge across devices, no conflict resolution, no second
  writer. Multi-device sync over an opaque blob is a hard problem and it is
  not the problem we have.
- **Not a server that can read anything.** No plaintext path exists, not
  for analytics, not for support, not for us.
- **Not a login wall.** The app works exactly as it does today without an
  account. Signing in is one row in Profile and one line on the first
  onboarding screen.

## The design

Sign in with Apple gives identity. A random key, generated on the device
and stored in the iCloud keychain, gives access. Our store holds ciphertext
addressed by the account. The account says *which* blob is yours; the key
says *how to open it*; we can do neither.

### Identity

Sign in with Apple, and only that. No password to forget, no email list, no
profile. Apple's `sub` is stable per app per user and arrives on every
sign-in, so **we never need to ask for the email scope and should not** — a
person's address is one more thing to hold and lose.

Supabase Auth verifies Apple's identity token — signature, issuer, our
bundle identifier as audience, expiry — and issues the session; there is
no JWT code of ours. The session's refresh token lives in the keychain
(the same native module that holds the data key), never in the SQLite
prefs, and signing out on the device revokes it.

### The key, and the one assumption to test first

A 256-bit key from `SymmetricKey(size: .bits256)`, generated on first
sign-in, written to the keychain with `kSecAttrSynchronizable` set.

That flag is the whole design. A synchronizable item lives in the iCloud
keychain rather than only in the app's local keychain, which means it is
expected to **survive app deletion** and to **reach a new phone** — the two
cases this feature exists for. Local-only keychain items have been deleted
with the app since iOS 10.3, so without that flag the ciphertext would be
permanently unopenable after exactly the event we are protecting against.

**Verify this on a real device before building anything else.** Write a
synchronizable item, delete the app, reinstall, read it back. Keychain
behaviour has moved across iOS versions and every other decision here rests
on this one. If it does not hold, the recovery code below becomes the only
mechanism and the design changes shape.

**If iCloud Keychain is off**, the key never leaves the device and the copy
cannot be opened anywhere else. The app must say so at setup rather than
promise a restore it cannot perform. So: offer a **recovery code** at
setup — the key itself, base32 with a checksum, shown once, ours to forget
immediately. Optional when iCloud Keychain is on, and the only way through
when it is off.

### The payload

`exportBackup()` already produces exactly the right thing and is already
covered by tests. Reuse it rather than inventing a second format:

1. `exportBackup(todayIso)` — the JSON the file backup already carries.
2. gzip. This JSON compresses enormously and there is no attacker-chosen
   plaintext mixed with a secret here, so compress-then-encrypt is safe.
3. AES-256-GCM, CryptoKit, a fresh twelve-byte nonce every time. Never
   reuse a nonce with the same key.

The envelope, which is what the store holds:

```json
{ "v": 1, "alg": "A256GCM", "nonce": "<b64>", "ct": "<b64>",
  "backupVersion": 7, "createdAt": "2026-09-17T14:02:11Z" }
```

`backupVersion` sits outside the ciphertext on purpose, so a client can
tell whether it can read a blob before spending a decryption on it. It
leaks the rough app version and nothing else.

**What is deliberately not in the payload:** the Apple Health cache.
`exportBackup()` already excludes it unless the diagnostics toggle is on,
and that exclusion must survive here. HealthKit values stay on the phone,
which keeps one payload definition and keeps health-store data out of our
infrastructure entirely.

### The store: Supabase · chosen 17 Sep 2026

Supabase, in an EU region. It was chosen because it removes two things
from the build rather than adding one: **Supabase Auth verifies the Apple
identity token** for us, so there is no JWT code of ours to get wrong, and
**Row Level Security is the server**, so there are no routes of ours to get
wrong either. `supabase/migrations/20260917000000_copies.sql` is the whole
store and `supabase/README.md` is the setup.

- One table, `public.copies`: the envelope column for column, plus
  `user_id` (defaulting to the caller) and `received_at` (the server's
  clock, which is what ordering uses — a phone's clock is a phone's clock).
- Append-only. A person may insert, read and delete their own rows. Nobody
  may update: no policy exists and the grant is revoked, two independent
  reasons. The anon role cannot reach the table at all.
- **The newest five are kept**, by a trigger, so there is never one
  mutable slot that one bad write can destroy.
- Account deletion is the one admin action, so it is an edge function
  (`supabase/functions/delete-account`) whose environment holds the service
  role key. The app never does. The caller is resolved from their own
  token; the function deletes that user's rows and then that user, and
  nothing is soft-deleted or retained.
- The app holds the project URL and the **anon** key, both public by
  design. RLS is the boundary, not the key, so SPEC's rule that no secret
  ships in the client holds.

`src/cloudSync.ts` is the client side of this: one row shape, checked
against the SQL by `tools/test-sync.js` so the two cannot drift; a push
that seals and appends; a pull that fetches the newest and opens it. The
store is an interface, so a Supabase client sits behind it in a dozen
lines and the tests use a fake with real crypto.

Upload after a check-in, debounced, and on background. A day's change
re-uploads the whole blob; at this size that is simpler than deltas and
simpler is the point.

Two operational facts to know going in. The free tier pauses a project
after a week idle, and a paused project is a failed restore on the day it
matters — take the paid plan or accept that knowingly. And the dashboard
will show the project owner rows of base64, which is the promise made
visible: exactly what an attacker with the database would see.

### Restore

Sign in, fetch, decrypt, hand the JSON to `applyBackup()`. It already
offers replace and merge and already guarantees the invariants — three
states survive, events dedupe on content, the background never overwrites
words written on this phone. The cloud restore is the file restore with a
different source, and it belongs beside the existing Restore line on the
first onboarding screen.

## App Review 5.1.3(ii)

The guideline that blocked the earlier plan forbids storing personal health
information in iCloud. This design does not: the health record is
ciphertext in **our** store, and what goes to iCloud is a **key**, which is
not health information. That is a different arrangement from the one the
September research found blocked, and it is worth confirming with review
rather than assuming, because the cost of being wrong is a rejected binary.

## What it costs, said out loud

- **The privacy label stops saying "Data Not Collected."** Apple counts
  transmission off the device as collection whether or not we can read it,
  so the listing will declare health data linked to an identifier. That
  label is currently a selling point and we are spending it.
- **We become a controller of special-category data.** Ciphertext we hold
  is still personal data. That means a processor agreement with the host,
  deletion on request, and breach duties — heavily mitigated by a breach
  yielding ciphertext, but not eliminated.
- **The site and the policy both carry a sentence that stops being true.**
  "No server that has ever held a pain score" becomes "a copy we cannot
  read." Neither changes until the code ships; a promise rewritten early is
  just a different lie.

## What must not change

1. No plaintext of the health record ever exists off the device. No
   exceptions for support, debugging or analytics.
2. The phone stays the only writer and the source of truth.
3. Analytics stays counts-only and the closed event list still governs. New
   events go in `EventName` in `src/analytics.ts`, and they count that a
   copy happened, never what was in it.
4. The app remains fully usable with no account.
5. Three states survive the round trip. The backup format already
   guarantees it and `tools/test-step1.js` already checks it.

## Build order

0. **Verify the synchronizable keychain assumption on a device.**
   Everything below depends on it.
1. **The envelope, in TypeScript.** gzip, build, parse, version checks, with
   the cipher behind an interface. Testable in Node today, no native
   dependency, no decisions pending.
2. **The native module.** CryptoKit AES-GCM plus keychain read and write.
   Needs `eas build`. Additive, so the JS requires it inside try/catch the
   way HealthKit and expo-glass-effect do, old binaries take the catch, and
   **`runtimeVersion` does not move** — everyone keeps receiving the same
   over-the-air updates.
3. **The store.** Written: the migration, the delete function and the
   client seam. Needs the project created, the Apple provider enabled, and
   `db push` plus `functions deploy` run once by the owner
   (`supabase/README.md`). Two public values then go in `app.config.js`.
4. **Sign in with Apple in the app.** Same native build as step two.
5. **The surfaces.** One Profile row, the setup flow with the recovery code,
   the restore path beside the file restore on the first onboarding screen.
6. **The policy, the labels and the site — at release, together.**
