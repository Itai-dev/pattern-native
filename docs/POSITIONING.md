# Pattern — positioning and product decisions

*Decided 2026-08-20, after two weeks of founder daily use and the research
review. This file is the argument; ROADMAP.md is the schedule; RESEARCH.md
is the evidence.*

## What Pattern is for

Two benefits lead. Both are felt by the founder, neither requires clinical
governance, and both are honest:

1. **Your doctor stops treating your memory.** Retrospective pain reports are
   distorted by the worst and most recent moments (peak-end bias). A doctor
   asking "how were the last three months?" is treating a biased sample.
   Pattern replaces recall with record. The clinician report is therefore the
   app's primary output — not a settings-page afterthought.
2. **You stop arguing with yourself about whether it's getting worse.**
   Ninety squares settle what memory can't. This is the "sense of control"
   benefit, and it already works.

**The function goal is not a third benefit — it is the multiplier on both.**
"Twenty minutes of walking, was five in June" turns the report clinical and
gives the map a meaning beyond symptom severity.

**The insight engine (benefit 4) is untested, not disproven.** Deprioritized
until the first three are strong. When built, it speaks in associations with
uncertainty, never causes.

## What Pattern is not

- Not a treatment. The PROSPER-FM trial put symptom tracking in the control
  arm (22% improved) against digital ACT (71%). Tracking alone is the control
  arm; Pattern does not pretend otherwise.
- Not a clinical instrument. General Wellness positioning: never diagnoses,
  treats, predicts, or advises on medication.
- Not another exhaustive tracker. Bearable exists. Every added input must be
  paid for by a removal or a demotion to optional.

## The solo-founder constraint (until a clinician joins)

Buildable now: PEG, function goal, flare/event log, pain-quality words,
treatments-tried log, weekly reflection, the clinician report, association
observations, the fortnight experiment (one thing tried, the mornings
after read back as a difference, no difference, or too few days).

Waits for clinical authorship: ACT, CBT, CBT-I, PRT, graded exposure,
pacing *instruction*, anything touching medication decisions.

## Non-negotiable principles (from the research scorecard)

1. Track briefly — optional detail, never mandatory forms.
2. Function over fixation.
3. Association, not causation — disclose uncertainty.
4. Wearables are context, never diagnosis.
5. No medication changes, ever.
6. A missed day is just a missed day — no streaks, no guilt.
7. Engagement rewards finding out and living, never looking at pain: a
   countdown to an answer, a sentence before a decision, an activity
   that went fine. Nothing that moves without a day added, nothing that
   rates today. (Decided 2026-09-11, replacing "nothing rewards looking
   at it" — a record read back was the control arm, and an app with
   nothing to come back for is a record nobody keeps.)

## The record leaves the phone, encrypted · decided 13 Sep 2026

**What forced it.** A tester lost their entire record. The app went from the
phone and the reinstall came back empty. Nothing was broken: the record is
one SQLite file in the app's container, deleting the app deletes the
container, and there was deliberately no copy anywhere else. The promise
worked exactly as written, and the promise is what destroyed the data.

That is not a bug to be fixed with a warning. A pain record's whole value is
that it is long — ninety squares settle what memory cannot, and a report is
worth showing because it covers months. The longer the record gets, the more
it is worth, and until 13 Sep 2026 the more it was worth the more there was
to lose to one tap, one lost phone, one TestFlight build running out at
ninety days. A tool whose value grows with the amount of data it can silently
destroy is not a tool anyone should be asked to trust with a year of their
life.

**What was rejected.** Asking harder. The mitigation shipped that same day —
Today asks for a saved copy, Profile says when the last one was made, the
first onboarding screen offers Restore — and it is worth keeping, but as a
floor, not the answer. Every version of it puts the work on a person with
chronic pain, on the day they are least able to do it, to protect against a
harm they cannot see coming. "The user should have exported a backup" is the
same sentence as "the user should have known", and it is not a design.

**The decision.** The record is copied off the phone automatically, and it is
encrypted before it goes:

- Pattern encrypts the backup on the device. What leaves is ciphertext.
- The key is held in Apple's iCloud Keychain, which is end-to-end encrypted
  in every account, with no setting to get wrong, and which survives the app
  being deleted.
- The ciphertext goes to the app's own private iCloud container, under the
  user's Apple ID. It survives the app being deleted, and comes back on
  reinstall.
- Pattern still has no server, no account and no login. There is still
  nowhere for us to put a health record and no way for us to read one.

**The line that replaces the old one.** "Nothing you told us about your body
ever leaves the phone" is retired. It was true, and it cost a tester their
record, and no sentence is worth that. The replacement is not a retreat and
should not be written as one:

> Your record is encrypted on your iPhone before a copy of it is placed in
> your own iCloud account. The key never leaves Apple's end-to-end encrypted
> keychain. Pattern has no server; neither we nor Apple can read what is
> stored.

That is a stronger claim than the one it replaces, not a weaker one. The old
line promised the data went nowhere. The new one promises it is unreadable
wherever it goes, which is the property people actually wanted, and it comes
with a copy that survives the thing that has already happened once.

**What we are honest about instead.** Three costs, and they belong in the
policy rather than in a footnote:

1. **A key the user does not have is a record the user cannot recover.** If
   iCloud Keychain is switched off, the key stays on that one device: it
   still survives deleting the app, but not losing the phone, and the copy
   in iCloud is then unreadable ciphertext. The app must say so plainly at
   the moment it matters, and the manual export stays exactly where it is as
   the way out. We do not invent a recovery phrase for a person in pain to
   write down and lose.
2. **Apple is now in the path.** Not for the contents, which are encrypted
   before they reach it, but for the fact that an account has a Pattern
   container at all, and for the availability of the whole thing. That is a
   real dependency and naming it is the price of the claim above.
3. **This is a backup, not sync.** One file, restored on a fresh install. It
   is not the live record shared across devices, because the same day edited
   in two places is a merge problem, and a wrong merge in a health record is
   a corrupted answer to a clinician's question. Sync stays a later decision,
   as SPEC 19.5 always had it.

**What does not change.** Nothing new is sent to us or to any processor we
control. The analytics rule is untouched: a closed event list, values capped
at 24 characters, opt-out in Profile, and never a health value. The engine
still runs on the phone. The report is still generated on the phone. What a
user flags about their own day is still their read of it and still never
reaches the engine.

**A native build is required**, and the automatic copy therefore reaches only
binaries built after this decision. The JavaScript must be guarded so that
older binaries take the catch and live without it, exactly as HealthKit and
expo-glass-effect did, so that everyone keeps receiving the same over-the-air
updates and the runtime version does not move.

## Known commercial facts

- App Store display name "Pattern" is taken; a distinct store name is needed
  before public launch (Home Screen name is unaffected).
- PROMIS / BPI require licensing — avoided. PEG is freely usable.
- The privacy answer changed on 24 Aug 2026, deliberately. It was "no data
  collected, literally true"; flying blind on retention made every growth
  decision unfalsifiable, so the line moved by one centimetre: **"nothing
  you told us about your body ever leaves the phone."** Anonymous usage
  counts — that a check-in happened, how long it took, never what it said —
  go to a named, EU-hosted processor, with an opt-out in Profile. The health
  record itself stays local, and any further move requires rewriting this
  paragraph first. **It changed again on 13 Sep 2026 — see below, which is
  that rewrite.**
