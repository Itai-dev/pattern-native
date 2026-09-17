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

### Two people, one check-in · decided 17 Sep 2026

The two benefits land on two different people, and the app now asks which
one it is talking to, on day zero:

- **Not yet diagnosed.** Years to a fibromyalgia or endometriosis diagnosis
  are the norm, and most of those years are spent failing to describe the
  pain in a ten-minute appointment. For this person the record is the raw
  material a diagnosis gets made from — onset, site, character, timing,
  what has been tried — put in front of a clinician without the distortion
  of memory. The report and the background are the product; the
  appointment is the event it is for.
- **Diagnosed.** The name is known; what is not known is what helps and
  what costs the next morning. For this person the experiment, the budget
  and the Health context are the product, and the background is a file they
  already have somewhere.

What this changes: the order Today offers things in, and the first row of
the report. What it does not change, and must never: Pattern does not
diagnose, and the list it shows is a vocabulary for what a clinician has
already said. A diagnosis suggested, inferred or hinted at by this app —
in a card, a sentence, an association's wording — is a regression, not a
feature. The answer itself never leaves the phone; analytics counts only
that the question was answered or passed over.

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

## The record had no copy · argued 13 Sep 2026, settled 15 Sep

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

**SETTLED ON 15 SEP, AND NOT THE WAY THIS SECTION EXPECTED.** What follows
is kept as the argument, because the argument is what holds; the mechanism
it proposed was wrong and was replaced two days later by a better one.

**What this section proposed, and why it is not what shipped.** It argued
for encrypting the record on the device and putting the ciphertext in the
app's own iCloud container. Researching the module to carry it turned up
App Store Review Guideline 5.1.3(ii) — *"may not store personal health
information in iCloud"* — with no carve-out for a private container and
none for data encrypted before it leaves. Pattern already reads HealthKit,
so the sentence points straight at it. The destination was blocked and the
section stalled there, with three routes written down and none taken.

**What shipped instead, on 15 Sep.** The record was already in the app's
Documents folder, which iOS has always included in the phone's own iCloud
or computer backup — Apple's, encrypted, under the person's account, never
ours. Nothing had to move. What moved was the Apple Health cache, out to
Library/Caches, which iOS never backs up, precisely so that 5.1.3 is
satisfied rather than argued with. The policy was rewritten to say all of
it. That is a better answer than this section's: no new dependency, no
native module, no permission from Apple, and a claim that was already true
rather than one the app had to go and make true.

**What it does not cover, and what this branch is therefore still for.**
The phone's backup answers *a lost or replaced phone*. It does not answer
*delete and reinstall on the same phone*, which is the failure that
actually happened: iOS hands a reinstalled app a fresh, empty container and
never consults the backup, so the record is gone while the backup sits
there intact. Short of restoring the entire device, nothing brings it back.
So the floor below still earns its place, and is the only thing that covers
that case:

- Today asks for a saved copy once a week of record exists without one.
- Profile says when the last copy was made, and that deleting the app
  deletes the record.
- The first onboarding screen offers Restore, so a reinstall reaches its
  file in one tap.

**What stands from the original argument, unchanged.** Asking harder is
not a design — "the user should have exported a backup" is the same
sentence as "the user should have known". A pain record's value grows with
its length, so the longer it runs the more one tap can destroy. And a tool
whose value grows with the amount of data it can silently lose is not one
anyone should be asked to trust with a year of their life.

**The native build is no longer blocked.** The watch provisioning profiles
were created on 15 Sep and build 47 proved it, so an iOS build no longer
needs anyone at a computer. Nothing in this section depends on that any
more, but the next thing that needs a binary will not wait on it. The JavaScript must be guarded so that
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
  that rewrite, and which 15 Sep then settled differently.**
- Said out loud on 15 Sep 2026, not changed: the record sits in the app's
  Documents folder, so it has always travelled in the phone's own iCloud or
  computer backup — Apple's, encrypted, under the person's account, never
  ours. That is the answer to "a lost phone is a lost record" (GROWTH.md)
  without a server, and the policy now says so. The Apple Health cache was
  moved to Caches, which iOS never backs up, because App Review 5.1.3
  forbids personal health information in iCloud. Pattern still collects
  nothing.
