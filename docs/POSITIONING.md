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

## Living actively with pain · decided 17 Sep 2026

*Replaces the "two people, one check-in" entry written earlier the same day,
which framed the undiagnosed audience as diagnosis-seeking. That framing
made the doctor PDF read as a step toward a diagnosis Pattern was helping to
make. It is not, and the product must never imply it.*

**The audience is defined by attitude, not by condition.** "I have pain,
but I still want to train, work, travel, sleep well, eat well and understand
my body. I am not accepting that pain gets to run my life." That is what
gives Pattern an identity beyond another pain diary, and it is the
territory: **living actively with pain**, not chronic pain management, which
sounds clinical, passive and resigned. Pattern is for people trying to get
back to something, or keep doing something, despite pain. Pain intensity is
one measure. Life regained is the outcome.

**The core audience.** Chronic or recurring pain, diagnosed or unexplained.
Still wants an active life, whatever "active" means for them. Already
thinks in health inputs: sleep, recovery, movement, medication, stress,
nutrition. Comfortable with health technology. Does not want to journal
symptoms obsessively; wants the app to do the analytical work. Their
question is not "how much did I hurt today?" but **"what is affecting my
pain, and what can I actually do with that?"** That last sentence is the
product.

**The initial ICP, deliberately narrow.** Roughly 25–50, iPhone and Apple
Watch or a wearable that writes to Apple Health, recurring or chronic
musculoskeletal or inflammatory-type pain, health-conscious, reasonably
active, already experimenting with exercise, recovery, sleep and treatment,
and frustrated that all their health data exists in different places and
nobody is connecting it to their pain. The brand can be broad; the person
the MVP is designed for is this specific. Expansion comes later.

**The hierarchy.**

- Emotional promise: *Don't let pain make your life smaller.*
- Functional promise: *Understand the patterns behind your pain.*
- How: connect pain with sleep, movement, stress, medication and the health
  data you already have.
- Outcome: better-informed decisions about what helps you stay active, and
  clearer communication with your doctor.

**The two framings, by diagnosis status.** Both are about understanding
and staying active; neither is about obtaining a diagnosis.

- Diagnosed: *Understand what affects your pain and what helps you stay
  active.*
- Not yet diagnosed: *Build a clearer picture of your pain, see its
  patterns, and bring better information to your doctor.*

The doctor PDF is exactly that: better information, without the distortion
of memory. The diagnosis, if one comes, is the doctor's. A card, a sentence
or an association worded as if Pattern were narrowing toward a name is a
regression, not a feature.

**Less logging, not more.** "People accustomed to logging" is a fine
early-adopter profile and a poor destination. Apple Health already knows
the workouts, sleep, steps and heart rate; pain is the one input it will
never know, so the check-in stays and everything else keeps moving to
Health. *You live your life. Pattern connects the dots.* One number a day;
Pattern brings the rest. Garmin, Oura and WHOOP reach Pattern only through
what they write to Health — sleep and workouts do, recovery scores mostly
do not — so the promise is "Apple Health and anything that feeds it", not a
brand list.

**Competitive distinction.** Bearable positions broadly around tracking
symptoms and feeling in control of chronic health issues; Manage My Pain
around recording pain and medication, finding connections and reports.
"We track more things" is not a wedge against either. Pattern owns a
different user and a different reason for tracking.

**What this positioning demands, and what it costs.**

- *The engine is slow on purpose, and this audience expects WHOOP.* The
  thresholds need eight paired observations per side and a 1.5-point
  difference before Pattern says anything; that is weeks. To this person,
  silence reads as broken unless the app says up front that it tells you
  when it cannot say yet, and counts down to when it can. The experiment
  and the budget already do this; the copy has to promise it.
- *"Life regained is the outcome" needs the thing that was cut.* The
  activity goal and its weekly rating were switched off because they asked
  for a second commitment before the first proved itself. **Decided the
  same day, and shipped on master as an intention, not a target:** one
  optional line on Today, "what do you want to keep doing?", in the
  person's words, printed in the clinician summary, never scored and
  never rated weekly (`src/ActivityIntention.tsx`, offered after the
  first recorded day). That is the lightest form the spine can take, and
  it keeps principle 7: nothing here moves without a day added and
  nothing rates today. Whether it also belongs on the day-zero screen in
  place of duration stays open.
- *Recruitment moves.* The Phase 2 tester is in running and climbing
  communities and physio waiting rooms, not r/Fibromyalgia. GROWTH.md's
  channels were written for the earlier audience.

**The line to keep coming back to:** Pattern isn't for people who want to
track their pain. It's for people who want to understand their pain so
they can keep living.

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

## An account, and a copy we cannot read · decided 17 Sep 2026

*This is the rewrite AGENTS.md requires before the code. The design is
`docs/ACCOUNTS.md`.*

**The promise moves by one centimetre, for the second time.** It was
"nothing you told us about your body ever leaves the phone". It becomes:
**nothing you told us about your body leaves the phone in a form anyone
else can read.** An optional account may hold a copy of the record,
encrypted on the device under a key we never see and cannot derive. We hold
ciphertext, addressed by an Apple user identifier, and nothing else.

**What forced it.** The 15 Sep answer — the record rides the phone's own
iCloud or computer backup — covers a lost or replaced phone and does not
cover delete and reinstall on the same phone, which is the failure that
actually happened to a tester and which every external tester meets on a
ninety-day TestFlight clock. The remaining mitigation is a file the person
has to have chosen to save, in advance, while in pain. That is the same
sentence as "the user should have known", which this file has already
rejected once.

**Why this version and not the other one.** A server that can read the
record would give us multi-device sync and aggregate insight into how the
app is really used. It would also make us the holder of a readable pain
history for every user, turn a breach into a disclosure of exactly the
thing people were promised would never travel, and spend the strongest
card the product holds. Encrypting on the device buys the failure we
actually need fixed and keeps the claim honest, at the price of never being
able to look inside. That price is the point: a promise we are technically
incapable of breaking is worth more than one we merely intend to keep.

**What it costs, and none of it is hidden.** The App Store listing stops
saying "Data Not Collected", because Apple counts transmission off the
device as collection whether or not we can read it. We become a controller
of special-category data, with a processor agreement, deletion on request
and breach duties — mitigated by a breach yielding ciphertext, not removed.
And two sentences we currently publish stop being true, so the policy, the
labels and the site change **at release and not before**: a promise
rewritten early is just a different lie.

**What is not on the table, and is not becoming so.** Reading the record
server-side, for support, for debugging, for analytics, or to build the
product. Analytics stays counts-only under the closed event list. If the
day comes that aggregate data is genuinely needed, the thing to collect is
a derived finding a person opted into sending, never their days — and that
is another rewrite of this section, not an extension of this one.

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
