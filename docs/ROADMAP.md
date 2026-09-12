# Pattern — roadmap

*Each phase answers the question that could kill the next one. Kill criteria
are commitments, not decoration. Updated 2026-09-10.*

## Phase 0 — Make it worth opening (n=1) · now → mid-Sep

Riskiest assumption: the founder opens it on day 26 without forcing himself.

- Native app daily-usable: rebuilt check-in (pain + where only), weekly PEG
  + function goal, flare/event log with quality words and treatments,
  clinician report, backup import from the web app.
- Retired: daily capacity slider (PEG covers it weekly, validated), nightly
  impact chips (moved into the flare log where they carry meaning), guided
  chat (pattern-matching theater), voice agent (contradicts the privacy
  line), 6 of 7 themes, the entire web reminder server (native reminders
  are local).

**Kill criterion:** fewer than 20/28 days logged, or logging feels like a
chore to the person who built it to his own taste.

## Phase 0.5 — The report, tested on a real clinician

- One page, SOCRATES order, ≤30 seconds; map as page two.
- Founder brings it to his own next appointment. Watch what the clinician
  does with it — engage or glance past. That single data point outranks a
  month of feature work.

**Kill criterion:** the clinician sets it aside. Then the format is wrong,
not the idea — iterate the page, not the app.

## Phase 1 — Get ahead of the flare · mid-Sep → mid-Oct

*Rewritten 2026-09-10.* The report answered "what happened"; a person
with pain already knows that by the time they read it. What they want is
the sentence BEFORE the workout, the bedtime, the second coffee — the
one that stops the session that costs tomorrow. The change is where and
when the app speaks, not what it is allowed to say: every sentence is
still a description of the person's own record, gated exactly as before,
and never "stop", "should" or a dose. Exercise helps most persistent
pain and the soreness after it is not damage; the target is
boom-and-bust, not exertion, and a nudge that breeds fear of moving is
a harm, not a feature. Exercise prescription still waits for a
clinician (POSITIONING.md).

Riskiest assumption: a person will act on their own threshold when it
is shown at the moment of decision, and would not have acted on the
same fact shown a week later on Trends.

1. **A personal load budget, from the record.** The workout-load
   association read forward: the person's usual workout in minutes, and
   the minutes past which their next mornings ran harder — the median
   and the upper tercile's first load, from the pairs the engine already
   evaluated. Silent until that association clears every gate it has
   now. Shown on Trends under *Before your next workout*. Ships OTA.
   *(built 2026-09-10: `src/health/budget.ts`)*
2. **Pre-workout delivery.** The reminder planner already knows when a
   workout usually starts. Deliver the budget sentence then, as a
   notification that says what the record says and nothing else. Ships
   OTA. *(built 2026-09-10: `typicalWorkoutStart` and the `budget`
   prompt in `src/health/prompts.ts`, under the cap, the gap and the
   waking window, never displacing a slot)*
3. **Close the loop.** The after-workout prompt asks how you are; the
   next morning's check-in is the outcome. Make sure a person who logs
   after a workout is asked the next morning, so the budget keeps
   learning. Mostly exists.
4. **The evening before, from the calendar.** The calendar already
   names tomorrow's class and its length. When a booked exertion
   runs past the line, Today shows it the day before with the
   record's sentence, and one action: *Open in Calendar*, which is
   Apple's own event editor prefilled with the event. Pattern never
   writes; only a tap on Save in Apple's sheet changes anything.
   Ships OTA. *(built 2026-09-10: `src/health/ahead.ts`, the card on
   Today, `editEventInCalendar` in `src/calendar.ts`)*

   **Retired before building, 2026-09-10 — in-session nudges.** Two
   were designed and dropped. A live budget on the Watch needs
   Pattern to run the workout session, which makes it a workout
   app. A heart-rate detector on the phone needs a permission the
   app refused, a native build, and mistakes stairs for a workout.
   Both aim at the wrong moment: forty minutes into a class nobody
   leaves because a wrist buzzed, the cost is felt the next morning
   and not in the session, and a buzz mid-effort reads as "stop"
   whatever it says. The decision that changes tomorrow is made the
   evening before, and that is where the app now speaks.
5. **The experiment.** One thing, in the person's words, for a
   fortnight. The evening check-in asks whether it happened; the next
   morning's number is the outcome; at the end the record says which
   of three true things it found — the mornings differed, they did
   not, or there were too few days each way. All three are answers.
   It extends itself to reach five days each way and gives up at four
   weeks. The one thing on Today that counts toward something, and
   what it counts toward is an answer. Ships OTA. *(built 2026-09-11:
   `src/experiment.ts`, the evening question in the check-in, the
   card and the offer on Today, `ExperimentSheet`)*
6. **Same shape for sleep and food.** Bedtime: the sleep association
   read forward ("mornings after under six hours ran harder"). Evening:
   caffeine and water already pair with evening pain. Same engine,
   delivered before the decision instead of after.

Steps 1–4 make the app proactive on every tester's phone without a
native build.

**Kill criterion:** after four weeks with a budget shown, the founder's
workouts do not cluster under the line, or the mornings after workouts
are no better than before it was shown. Then the moment is wrong or the
number is, and the fix is the delivery, not the engine.

**What this retires from the old Phase 1:** the weekly story. The
self-experiment came back on 2026-09-11 as step 5, once the rule on
engagement was rewritten (POSITIONING.md, principle 7): a countdown to
an answer is the honest kind of reason to open the app.

## Phase 2 — n=10 · mid-Oct → Dec

- 10 chronic-pain testers via TestFlight external testing; recruit from
  content (channel must be built during Phase 1).
- One metric: who still logs in week 4.

**Kill criterion:** fewer than 5/10 logging at week 4.

## Phase 3 — The fork resolves · Dec →

With retention + report evidence in hand, choose: consumer wellness product
(App Store, freemium, solo) vs clinical-evidence path (partners, capital).
Deciding earlier is guessing.

## Phase 4 — Recommended in Health · after the App Store

"Recommended in Health" is two different things, and Pattern is built
today to qualify for neither.

**The Apps list inside Health** is mechanical: under Browse, each data
type lists the apps that can WRITE it. Pain lives there as Symptoms
(Generalized Body Ache, Lower Back Pain, Headache, Pelvic Pain,
Fatigue), each with a severity of mild, moderate or severe. Pattern
promises the opposite in its usage string ("never writes to Apple
Health") and in POSITIONING.md (local SQLite only). HealthKit stays on
the phone and is end-to-end encrypted, so the promise can be redrawn
honestly, in this order:

1. **Rewrite POSITIONING.md first** (AGENTS.md: what leaves the phone
   changes there before it changes in code). The new line: the record
   is local; the person may choose to copy pain into Health, and
   Health's own sharing rules take over from there.
2. **Write Symptoms, opt-in, never default.** A switch in Profile, off
   until touched. The coarse band (mild / moderate / severe) is
   explained beside the switch, and the exact 0–10 goes in the sample's
   metadata so nothing invented stands in for the number the user
   entered. A skipped answer is never written as "not present" — three
   states survive the copy or the copy does not happen.
3. **A new binary.** The write usage string and entitlement live in
   Info.plist, so this needs `eas build`. The JS guards the call, so
   the runtime does not bump and old binaries keep taking OTA updates.

**Editorial features** (the Health category on the App Store, "apps for
chronic conditions", Health app promotions) are curated. What editors
look for, against where Pattern stands:

- Two-way HealthKit integration — missing until the steps above.
- The newest platform features — Liquid Glass and the widget are in;
  a Watch check-in, Shortcuts and a Live Activity for the flare
  follow-up are not.
- Accessibility done properly — mostly there; audit Dynamic Type,
  VoiceOver labels and Reduce Motion before nominating.
- Privacy that reads as a feature — Pattern's strongest card. No
  accounts, no servers, no ads, and it stays that way.
- A clinical story — CareKit apps get featured; the one-page clinician
  summary is the nearest thing to it.
- A public listing with ratings — nothing to feature while it is in
  TestFlight.

**The path, in order:** the App Store listing (Phase 3's consumer fork,
or the clinical one — both need a public app), then opt-in Symptom
writing with the positioning rewrite, then Shortcuts and a Watch
check-in, then nominate through App Store Connect's promotion form
once ratings exist.

**Kill criterion:** if fewer than one tester in five turns the Health
switch on in its first month, the Apps list is not where these people
look for Pattern, and the editorial path alone is worth the work.

## Parked (deliberately)

PROMIS/BPI (licensing), pain-quality beyond the flare log, HRV, widgets,
Hebrew in native, the five-column research DB expansion, ACT/CBT content
(needs clinician). The Apple Watch check-in and the App Store listing
moved to Phase 4 on 2026-09-12.
